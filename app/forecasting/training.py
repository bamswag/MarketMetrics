from __future__ import annotations

import asyncio
import json
import math
import os
import warnings
from collections import OrderedDict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from app.core.config import settings
from app.forecasting.feature_engineering import (
    TARGET_HORIZONS,
    build_benchmark_feature_snapshot,
    build_latest_symbol_feature_snapshot,
    build_training_dataset,
)
from app.integrations.alpaca.market_data import (
    AlpacaMarketDataError,
    fetch_daily_bar_rows,
    fetch_market_calendar,
)
from app.schemas.forecasts import (
    FeatureImportancePoint,
    ForecastSeriesPoint,
    PredictionMetrics,
    PredictionRequest,
    PredictionResponse,
    PriceSeriesPoint,
    ProjectedPortfolioPoint,
)
from app.services.search import (
    get_symbol_asset_class,
    get_training_universe_symbols,
    normalize_catalog_symbol,
)


BENCHMARK_SYMBOLS = ("SPY", "QQQ")
DIRECT_HORIZONS = (1, 5, 10)
CALIBRATION_MAX_HORIZON = 10
DEFAULT_INTERVAL_LEVEL = 0.8
MINIMUM_HISTORY_INDEX = 252
MINIMUM_USABLE_HISTORY_DAYS = MINIMUM_HISTORY_INDEX + max(DIRECT_HORIZONS) + 1
WALK_FORWARD_TARGET_FOLDS = 4
HOLDOUT_DATE_FRACTION = 0.2
TOP_SYMBOL_CHART_LIMIT = 3


class PredictionModelError(Exception):
    pass


def _require_ml_dependencies():
    try:
        import joblib
        import numpy as np
        import pandas as pd
        from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
        from sklearn.linear_model import Ridge
        from sklearn.metrics import mean_absolute_error, mean_squared_error
        from sklearn.model_selection import ParameterGrid
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:
        raise PredictionModelError(
            "Prediction dependencies are not installed. Install requirements.txt to use forecasting."
        ) from exc

    return {
        "joblib": joblib,
        "np": np,
        "pd": pd,
        "HistGradientBoostingRegressor": HistGradientBoostingRegressor,
        "RandomForestRegressor": RandomForestRegressor,
        "Ridge": Ridge,
        "mean_absolute_error": mean_absolute_error,
        "mean_squared_error": mean_squared_error,
        "ParameterGrid": ParameterGrid,
        "Pipeline": Pipeline,
        "StandardScaler": StandardScaler,
    }


def _model_root() -> Path:
    settings.prediction_model_dir.mkdir(parents=True, exist_ok=True)
    return settings.prediction_model_dir


def _latest_model_pointer() -> Path:
    return _model_root() / "latest.json"


def _version_dir(version: str) -> Path:
    return _model_root() / version


async def _fetch_symbol_histories(
    symbols: Iterable[str],
    *,
    start: date,
    end: date,
) -> Dict[str, List[dict]]:
    normalized_symbols = [
        normalize_catalog_symbol(symbol, get_symbol_asset_class(symbol))
        for symbol in symbols
        if symbol
    ]
    semaphore = asyncio.Semaphore(max(settings.prediction_fetch_concurrency, 1))

    async def _fetch(symbol: str):
        async with semaphore:
            try:
                rows = await fetch_daily_bar_rows(
                    symbol,
                    start=start,
                    end=end,
                    asset_class=get_symbol_asset_class(symbol),
                )
                return symbol, rows, None
            except Exception as exc:
                return symbol, None, exc

    results = await asyncio.gather(*[_fetch(symbol) for symbol in normalized_symbols])

    histories: Dict[str, List[dict]] = {}
    failures: Dict[str, Exception] = {}
    for symbol, rows, error in results:
        if error is not None:
            failures[symbol] = error
            continue
        if rows:
            histories[symbol] = rows

    if not histories:
        first_error = next(iter(failures.values()), None)
        if first_error:
            raise PredictionModelError(str(first_error))
        raise PredictionModelError("No historical data could be fetched for the training universe.")

    return histories


def _default_model_version() -> str:
    return datetime.utcnow().strftime("forecast_%Y%m%d_%H%M%S")


def _safe_float(value) -> float:
    return float(value) if value is not None else 0.0


def _model_display_name(model_type: str) -> str:
    mapping = {
        "RandomForestRegressor": "Random Forest",
        "HistGradientBoostingRegressor": "Histogram Gradient Boosting",
        "Ridge": "Ridge Regression",
    }
    return mapping.get(model_type, model_type)


def _model_complexity_rank(model_type: str) -> int:
    return {
        "Ridge": 0,
        "HistGradientBoostingRegressor": 1,
        "RandomForestRegressor": 2,
    }.get(model_type, 10)


def _instantiate_model(model_type: str, params: Dict[str, object]):
    libs = _require_ml_dependencies()
    RandomForestRegressor = libs["RandomForestRegressor"]
    HistGradientBoostingRegressor = libs["HistGradientBoostingRegressor"]
    Ridge = libs["Ridge"]
    Pipeline = libs["Pipeline"]
    StandardScaler = libs["StandardScaler"]

    if model_type == "RandomForestRegressor":
        return RandomForestRegressor(random_state=42, n_jobs=1, **params)
    if model_type == "HistGradientBoostingRegressor":
        return HistGradientBoostingRegressor(random_state=42, **params)
    if model_type == "Ridge":
        return Pipeline(
            [
                ("scaler", StandardScaler()),
                ("ridge", Ridge(**params)),
            ]
        )
    raise PredictionModelError(f"Unsupported model type: {model_type}")


def _candidate_param_grids(ParameterGrid) -> Dict[str, List[Dict[str, object]]]:
    return {
        "RandomForestRegressor": list(
            ParameterGrid(
                {
                    "n_estimators": [100],
                    "max_depth": [8, None],
                    "min_samples_leaf": [1, 3],
                    "max_features": ["sqrt"],
                }
            )
        ),
        "HistGradientBoostingRegressor": list(
            ParameterGrid(
                {
                    "learning_rate": [0.05, 0.1],
                    "max_depth": [4, None],
                    "max_leaf_nodes": [15],
                    "max_iter": [200],
                }
            )
        ),
        "Ridge": list(
            ParameterGrid(
                {
                    "alpha": [0.1, 1.0, 5.0],
                }
            )
        ),
    }


def _build_feature_importances(feature_names: List[str], model) -> List[Dict[str, float]]:
    importances = None

    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    elif hasattr(model, "named_steps") and "ridge" in model.named_steps:
        coefficients = model.named_steps["ridge"].coef_
        absolute = [abs(float(value)) for value in coefficients]
        total = sum(absolute) or 1.0
        importances = [value / total for value in absolute]

    if importances is None:
        return []

    paired = [
        {"feature": feature, "importance": round(float(importance), 6)}
        for feature, importance in zip(feature_names, importances)
    ]
    paired.sort(key=lambda item: item["importance"], reverse=True)
    return paired


def _build_holdout_plot_frame(eval_frame, predicted_prices=None):
    libs = _require_ml_dependencies()
    pd = libs["pd"]

    if eval_frame is None or eval_frame.empty:
        return pd.DataFrame()

    if predicted_prices is not None:
        eval_frame = pd.DataFrame(
            {
                "date": eval_frame["date"],
                "actual_next_close": eval_frame["next_close"].astype(float),
                "predicted_next_close": [float(value) for value in predicted_prices],
            }
        )

    plot_frame = pd.DataFrame(
        {
            "date": pd.to_datetime(eval_frame["date"]),
            "actual_next_close": eval_frame["actual_next_close"].astype(float),
            "predicted_next_close": eval_frame["predicted_next_close"].astype(float),
        }
    )
    return (
        plot_frame.groupby("date", as_index=False)
        .agg(
            actual_next_close=("actual_next_close", "mean"),
            predicted_next_close=("predicted_next_close", "mean"),
        )
        .sort_values("date")
        .reset_index(drop=True)
    )


def _save_average_plot(output_path: Path, plot_frame, *, model_label: str) -> None:
    try:
        mpl_config_dir = _model_root() / ".matplotlib"
        mpl_config_dir.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("MPLCONFIGDIR", str(mpl_config_dir))

        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.dates as mdates
        import matplotlib.pyplot as plt
    except Exception:
        return

    if plot_frame is None or plot_frame.empty:
        return

    fig, ax = plt.subplots(figsize=(12, 5.5))
    ax.plot(
        plot_frame["date"],
        plot_frame["actual_next_close"],
        label="Actual average next close",
        linewidth=2.5,
        color="#2563eb",
    )
    ax.plot(
        plot_frame["date"],
        plot_frame["predicted_next_close"],
        label="Predicted average next close",
        linewidth=2.5,
        color="#f97316",
    )
    ax.set_title(f"{model_label} Forecast: Holdout Average by Date", fontsize=18, pad=10)
    ax.set_xlabel("Holdout date", fontsize=12)
    ax.set_ylabel("Average next close", fontsize=12)
    ax.grid(alpha=0.2)

    locator = mdates.MonthLocator(interval=1)
    formatter = mdates.DateFormatter("%b %Y")
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(formatter)
    ax.tick_params(axis="x", labelsize=10)
    ax.tick_params(axis="y", labelsize=10)

    for label in ax.get_xticklabels():
        label.set_rotation(30)
        label.set_ha("right")

    ax.legend(fontsize=11)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)


def _save_symbol_plot(output_path: Path, plot_frame, *, model_label: str, symbol: str) -> None:
    try:
        mpl_config_dir = _model_root() / ".matplotlib"
        mpl_config_dir.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("MPLCONFIGDIR", str(mpl_config_dir))

        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.dates as mdates
        import matplotlib.pyplot as plt
    except Exception:
        return

    if plot_frame is None or plot_frame.empty:
        return

    fig, ax = plt.subplots(figsize=(12, 5.5))
    ax.plot(
        plot_frame["date"],
        plot_frame["actual_next_close"],
        label="Actual next close",
        linewidth=2.4,
        color="#2563eb",
    )
    ax.plot(
        plot_frame["date"],
        plot_frame["predicted_next_close"],
        label="Predicted next close",
        linewidth=2.4,
        color="#f97316",
    )
    ax.set_title(f"{model_label}: {symbol} Holdout Next Close", fontsize=18, pad=10)
    ax.set_xlabel("Holdout date", fontsize=12)
    ax.set_ylabel("Next close", fontsize=12)
    ax.grid(alpha=0.2)

    locator = mdates.MonthLocator(interval=1)
    formatter = mdates.DateFormatter("%b %Y")
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(formatter)
    for label in ax.get_xticklabels():
        label.set_rotation(30)
        label.set_ha("right")

    ax.legend(fontsize=11)
    fig.tight_layout()
    fig.savefig(output_path, dpi=160)
    plt.close(fig)


def _target_column_for_horizon(horizon: int) -> str:
    return "target_next_return" if horizon == 1 else f"target_next_return_{horizon}d"


def _next_close_column_for_horizon(horizon: int) -> str:
    return "next_close" if horizon == 1 else f"next_close_{horizon}d"


def _frame_for_dates(frame, dates: Sequence) -> object:
    return frame[frame["date"].isin(dates)].reset_index(drop=True)


def _build_date_windows(dataset) -> Tuple[List, List, object, object]:
    unique_dates = list(dataset["date"].drop_duplicates().sort_values())
    if len(unique_dates) < 12:
        raise PredictionModelError("Training dataset does not contain enough unique dates for walk-forward evaluation.")

    holdout_count = max(int(math.ceil(len(unique_dates) * HOLDOUT_DATE_FRACTION)), 1)
    holdout_count = min(holdout_count, len(unique_dates) - 1)
    train_dates = unique_dates[:-holdout_count]
    holdout_dates = unique_dates[-holdout_count:]
    train_frame = _frame_for_dates(dataset, train_dates)
    holdout_frame = _frame_for_dates(dataset, holdout_dates)
    if holdout_frame.empty:
        raise PredictionModelError("Not enough holdout data to evaluate the model.")
    return train_dates, holdout_dates, train_frame, holdout_frame


def _build_walk_forward_folds(train_dates: Sequence, *, requested_folds: int = WALK_FORWARD_TARGET_FOLDS) -> List[Dict[str, object]]:
    libs = _require_ml_dependencies()
    np = libs["np"]

    if len(train_dates) < 4:
        raise PredictionModelError("Training dataset is too small for walk-forward validation.")

    chunk_count = min(requested_folds + 1, len(train_dates) - 1)
    chunks = [list(chunk) for chunk in np.array_split(train_dates, chunk_count) if len(chunk)]
    folds: List[Dict[str, object]] = []
    for index in range(len(chunks) - 1):
        fold_train_dates = [item for chunk in chunks[: index + 1] for item in chunk]
        fold_val_dates = list(chunks[index + 1])
        if not fold_train_dates or not fold_val_dates:
            continue
        folds.append(
            {
                "trainDates": fold_train_dates,
                "validationDates": fold_val_dates,
                "trainStart": str(fold_train_dates[0].date()),
                "trainEnd": str(fold_train_dates[-1].date()),
                "validationStart": str(fold_val_dates[0].date()),
                "validationEnd": str(fold_val_dates[-1].date()),
            }
        )
    if not folds:
        raise PredictionModelError("Unable to create walk-forward validation folds.")
    return folds


def _calculate_return_correlation(actual_returns, predicted_returns, np) -> float:
    if len(actual_returns) < 2:
        return 0.0
    if float(np.std(actual_returns)) == 0.0 or float(np.std(predicted_returns)) == 0.0:
        return 0.0
    return float(np.corrcoef(actual_returns, predicted_returns)[0, 1])


def _calculate_directional_accuracy(actual_returns, predicted_returns, np) -> float:
    actual_sign = np.sign(actual_returns)
    predicted_sign = np.sign(predicted_returns)
    return float((actual_sign == predicted_sign).mean())


def _calculate_up_down_hit_rates(actual_returns, predicted_returns, np) -> Tuple[float, float]:
    actual_sign = np.sign(actual_returns)
    predicted_sign = np.sign(predicted_returns)
    up_mask = actual_sign > 0
    down_mask = actual_sign < 0
    up_hit_rate = float((predicted_sign[up_mask] > 0).mean()) if up_mask.any() else 0.0
    down_hit_rate = float((predicted_sign[down_mask] < 0).mean()) if down_mask.any() else 0.0
    return up_hit_rate, down_hit_rate


def _evaluate_returns(
    base_close_series,
    actual_returns,
    predicted_returns,
    actual_prices,
):
    libs = _require_ml_dependencies()
    np = libs["np"]
    mean_absolute_error = libs["mean_absolute_error"]
    mean_squared_error = libs["mean_squared_error"]

    predicted_prices = base_close_series * (1 + predicted_returns)
    mae_price = float(mean_absolute_error(actual_prices, predicted_prices))
    rmse_price = float(math.sqrt(mean_squared_error(actual_prices, predicted_prices)))
    mae_return = float(mean_absolute_error(actual_returns, predicted_returns))
    rmse_return = float(math.sqrt(mean_squared_error(actual_returns, predicted_returns)))
    directional_accuracy = _calculate_directional_accuracy(actual_returns, predicted_returns, np)
    return_correlation = _calculate_return_correlation(actual_returns, predicted_returns, np)
    up_hit_rate, down_hit_rate = _calculate_up_down_hit_rates(actual_returns, predicted_returns, np)

    return (
        {
            "maePrice": round(mae_price, 6),
            "rmsePrice": round(rmse_price, 6),
            "maeReturn": round(mae_return, 6),
            "rmseReturn": round(rmse_return, 6),
            "directionalAccuracy": round(directional_accuracy, 6),
            "returnCorrelation": round(return_correlation, 6),
            "upDayHitRate": round(up_hit_rate, 6),
            "downDayHitRate": round(down_hit_rate, 6),
        },
        predicted_prices,
    )


def _build_eval_frame(test_frame, predicted_returns, predicted_prices, *, target_col: str, next_close_col: str):
    libs = _require_ml_dependencies()
    pd = libs["pd"]

    return pd.DataFrame(
        {
            "date": test_frame["date"],
            "symbol": test_frame["symbol"],
            "base_close": test_frame["close"].astype(float),
            "actual_return": test_frame[target_col].astype(float),
            "predicted_return": [float(value) for value in predicted_returns],
            "actual_next_close": test_frame[next_close_col].astype(float),
            "predicted_next_close": [float(value) for value in predicted_prices],
        }
    ).sort_values(["date", "symbol"]).reset_index(drop=True)


def _compute_holdout_strategy_metrics(eval_frame) -> Dict[str, float]:
    if eval_frame.empty:
        return {
            "signalStrategyReturn": 0.0,
            "buyAndHoldReturn": 0.0,
        }

    buy_hold_compound = 1.0
    signal_compound = 1.0
    for _, frame in eval_frame.groupby("date"):
        buy_hold_daily = float(frame["actual_return"].mean())
        signal_daily = (
            float(frame.loc[frame["predicted_return"] > 0, "actual_return"].mean())
            if (frame["predicted_return"] > 0).any()
            else 0.0
        )
        buy_hold_compound *= 1 + buy_hold_daily
        signal_compound *= 1 + signal_daily

    return {
        "signalStrategyReturn": round(signal_compound - 1, 6),
        "buyAndHoldReturn": round(buy_hold_compound - 1, 6),
    }


def _build_per_symbol_metrics(eval_frame) -> Dict[str, Dict[str, float]]:
    libs = _require_ml_dependencies()
    np = libs["np"]
    mean_absolute_error = libs["mean_absolute_error"]
    mean_squared_error = libs["mean_squared_error"]

    results: Dict[str, Dict[str, float]] = {}
    for symbol, symbol_frame in eval_frame.groupby("symbol"):
        actual_returns = symbol_frame["actual_return"].to_numpy(dtype=float)
        predicted_returns = symbol_frame["predicted_return"].to_numpy(dtype=float)
        actual_prices = symbol_frame["actual_next_close"].to_numpy(dtype=float)
        predicted_prices = symbol_frame["predicted_next_close"].to_numpy(dtype=float)

        direction = _calculate_directional_accuracy(actual_returns, predicted_returns, np)
        correlation = _calculate_return_correlation(actual_returns, predicted_returns, np)
        up_hit_rate, down_hit_rate = _calculate_up_down_hit_rates(actual_returns, predicted_returns, np)

        results[symbol] = {
            "observationCount": int(len(symbol_frame)),
            "maeReturn": round(float(mean_absolute_error(actual_returns, predicted_returns)), 6),
            "rmseReturn": round(float(math.sqrt(mean_squared_error(actual_returns, predicted_returns))), 6),
            "maePrice": round(float(mean_absolute_error(actual_prices, predicted_prices)), 6),
            "directionalAccuracy": round(direction, 6),
            "returnCorrelation": round(correlation, 6),
            "upDayHitRate": round(up_hit_rate, 6),
            "downDayHitRate": round(down_hit_rate, 6),
        }
    return results


def _build_per_symbol_series(eval_frame) -> Dict[str, List[Dict[str, float]]]:
    per_symbol: Dict[str, List[Dict[str, float]]] = {}
    for symbol, symbol_frame in eval_frame.groupby("symbol"):
        per_symbol[symbol] = [
            {
                "date": str(row.date.date()),
                "actualNextClose": round(float(row.actual_next_close), 6),
                "predictedNextClose": round(float(row.predicted_next_close), 6),
                "actualReturnPct": round(float(row.actual_return) * 100, 6),
                "predictedReturnPct": round(float(row.predicted_return) * 100, 6),
            }
            for row in symbol_frame.sort_values("date").itertuples(index=False)
        ]
    return per_symbol


def _candidate_is_better(candidate: Dict[str, object], best: Optional[Dict[str, object]]) -> bool:
    if best is None:
        return True
    mae_tolerance = 1e-8
    mae_diff = float(candidate["averageMaeReturn"]) - float(best["averageMaeReturn"])
    if mae_diff < -mae_tolerance:
        return True
    if abs(mae_diff) <= mae_tolerance:
        directional_diff = float(candidate["averageDirectionalAccuracy"]) - float(best["averageDirectionalAccuracy"])
        if directional_diff > mae_tolerance:
            return True
        if abs(directional_diff) <= mae_tolerance:
            return _model_complexity_rank(str(candidate["modelType"])) < _model_complexity_rank(str(best["modelType"]))
    return False


def _evaluate_model_candidates(
    train_frame,
    feature_columns: List[str],
    folds: List[Dict[str, object]],
    *,
    target_col: str,
    allowed_model_types: Optional[Sequence[str]] = None,
):
    libs = _require_ml_dependencies()
    mean_absolute_error = libs["mean_absolute_error"]
    ParameterGrid = libs["ParameterGrid"]

    candidate_grids = _candidate_param_grids(ParameterGrid)
    if allowed_model_types is None:
        allowed_model_types = list(candidate_grids.keys())

    candidate_results: List[Dict[str, object]] = []
    best_candidate: Optional[Dict[str, object]] = None

    for model_type in allowed_model_types:
        for params in candidate_grids[model_type]:
            fold_scores: List[Dict[str, object]] = []
            fold_maes: List[float] = []
            fold_directional_accuracies: List[float] = []

            for fold in folds:
                fold_train_frame = _frame_for_dates(train_frame, fold["trainDates"])
                fold_val_frame = _frame_for_dates(train_frame, fold["validationDates"])
                if fold_train_frame.empty or fold_val_frame.empty:
                    continue

                model = _instantiate_model(model_type, params)
                fold_train_x = fold_train_frame[feature_columns]
                fold_train_y = fold_train_frame[target_col]
                fold_val_x = fold_val_frame[feature_columns]
                fold_val_y = fold_val_frame[target_col]

                try:
                    with warnings.catch_warnings():
                        warnings.simplefilter("error", RuntimeWarning)
                        model.fit(fold_train_x, fold_train_y)
                        fold_predictions = model.predict(fold_val_x)
                except (RuntimeWarning, FloatingPointError, ValueError):
                    fold_scores = []
                    fold_maes = []
                    fold_directional_accuracies = []
                    break

                if not libs["np"].isfinite(fold_predictions).all():
                    fold_scores = []
                    fold_maes = []
                    fold_directional_accuracies = []
                    break
                mae_return = float(mean_absolute_error(fold_val_y, fold_predictions))
                directional_accuracy = _calculate_directional_accuracy(
                    fold_val_y.to_numpy(dtype=float),
                    fold_predictions,
                    libs["np"],
                )
                fold_maes.append(mae_return)
                fold_directional_accuracies.append(directional_accuracy)
                fold_scores.append(
                    {
                        "trainStart": fold["trainStart"],
                        "trainEnd": fold["trainEnd"],
                        "validationStart": fold["validationStart"],
                        "validationEnd": fold["validationEnd"],
                        "maeReturn": round(mae_return, 6),
                        "directionalAccuracy": round(directional_accuracy, 6),
                    }
                )

            if not fold_scores:
                continue

            candidate = {
                "modelType": model_type,
                "params": params,
                "averageMaeReturn": round(sum(fold_maes) / len(fold_maes), 6),
                "averageDirectionalAccuracy": round(
                    sum(fold_directional_accuracies) / len(fold_directional_accuracies),
                    6,
                ),
                "foldScores": fold_scores,
            }
            candidate_results.append(candidate)
            if _candidate_is_better(candidate, best_candidate):
                best_candidate = candidate

    if best_candidate is None:
        raise PredictionModelError("Unable to score any forecasting model candidates.")

    return best_candidate, candidate_results


def _train_model(train_frame, feature_columns: List[str], *, target_col: str, model_type: str, params: Dict[str, object]):
    model = _instantiate_model(model_type, params)
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        model.fit(train_frame[feature_columns], train_frame[target_col])
    return model


def _evaluate_direct_horizon_model(model, test_frame, feature_columns: List[str], *, horizon: int):
    libs = _require_ml_dependencies()
    target_col = _target_column_for_horizon(horizon)
    next_close_col = _next_close_column_for_horizon(horizon)
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        predicted_returns = model.predict(test_frame[feature_columns])
    if not libs["np"].isfinite(predicted_returns).all():
        raise PredictionModelError("Selected forecasting model produced non-finite holdout predictions.")
    actual_returns = test_frame[target_col].to_numpy(dtype=float)
    actual_prices = test_frame[next_close_col].to_numpy(dtype=float)
    base_close = test_frame["close"].to_numpy(dtype=float)
    metrics, predicted_prices = _evaluate_returns(base_close, actual_returns, predicted_returns, actual_prices)
    eval_frame = _build_eval_frame(
        test_frame,
        predicted_returns,
        predicted_prices,
        target_col=target_col,
        next_close_col=next_close_col,
    )
    return metrics, predicted_returns, predicted_prices, eval_frame


def _build_interval_calibration(anchor_residuals: Dict[int, Sequence[float]], *, interval_level: float = DEFAULT_INTERVAL_LEVEL):
    libs = _require_ml_dependencies()
    np = libs["np"]

    lower_quantile = (1 - interval_level) / 2
    upper_quantile = 1 - lower_quantile

    anchors: Dict[int, Dict[str, float]] = {}
    for horizon, residuals in anchor_residuals.items():
        residual_array = np.array(list(residuals), dtype=float)
        if residual_array.size == 0:
            continue
        anchors[horizon] = {
            "lowerResidualQuantile": round(float(np.quantile(residual_array, lower_quantile)), 6),
            "upperResidualQuantile": round(float(np.quantile(residual_array, upper_quantile)), 6),
            "observationCount": int(residual_array.size),
            "source": f"direct_{horizon}d",
        }

    if 1 not in anchors:
        raise PredictionModelError("Unable to build interval calibration without 1-day residuals.")

    def interpolate(lower_anchor: int, upper_anchor: int, horizon: int) -> Dict[str, float]:
        if lower_anchor == upper_anchor:
            return dict(anchors[lower_anchor])
        ratio = (horizon - lower_anchor) / (upper_anchor - lower_anchor)
        lower_residual = anchors[lower_anchor]["lowerResidualQuantile"] + (
            anchors[upper_anchor]["lowerResidualQuantile"] - anchors[lower_anchor]["lowerResidualQuantile"]
        ) * ratio
        upper_residual = anchors[lower_anchor]["upperResidualQuantile"] + (
            anchors[upper_anchor]["upperResidualQuantile"] - anchors[lower_anchor]["upperResidualQuantile"]
        ) * ratio
        return {
            "lowerResidualQuantile": round(float(lower_residual), 6),
            "upperResidualQuantile": round(float(upper_residual), 6),
            "observationCount": int(
                round(
                    anchors[lower_anchor]["observationCount"]
                    + (anchors[upper_anchor]["observationCount"] - anchors[lower_anchor]["observationCount"]) * ratio
                )
            ),
            "source": f"interpolated_{lower_anchor}d_{upper_anchor}d",
        }

    by_horizon: Dict[str, Dict[str, float]] = {}
    for horizon in range(1, CALIBRATION_MAX_HORIZON + 1):
        if horizon in anchors:
            by_horizon[str(horizon)] = anchors[horizon]
        elif horizon < 5 and 5 in anchors:
            by_horizon[str(horizon)] = interpolate(1, 5, horizon)
        elif 5 in anchors and 10 in anchors:
            by_horizon[str(horizon)] = interpolate(5, 10, horizon)
        else:
            by_horizon[str(horizon)] = dict(anchors[max(anchors.keys())])

    return {
        "intervalLevel": interval_level,
        "anchorHorizons": list(DIRECT_HORIZONS),
        "byHorizon": by_horizon,
    }


def _apply_recursive_anchor(last_actual_close: float, recursive_closes: List[float], anchored_terminal_close: float) -> List[float]:
    if not recursive_closes:
        return []
    if len(recursive_closes) == 1:
        return [max(anchored_terminal_close, 0.01)]

    current_terminal_close = recursive_closes[-1]
    if current_terminal_close <= 0 or last_actual_close <= 0:
        return recursive_closes

    current_growth = current_terminal_close / last_actual_close
    anchored_growth = max(anchored_terminal_close / last_actual_close, 0.01)
    if current_growth <= 0:
        return recursive_closes

    adjusted: List[float] = []
    horizon = len(recursive_closes)
    for index, predicted_close in enumerate(recursive_closes, start=1):
        recursive_growth = max(predicted_close / last_actual_close, 0.01)
        growth_adjustment = (anchored_growth / current_growth) ** (index / horizon)
        adjusted_close = last_actual_close * recursive_growth * growth_adjustment
        adjusted.append(max(float(adjusted_close), 0.01))
    adjusted[-1] = max(float(anchored_terminal_close), 0.01)
    return adjusted


def _interval_bounds_for_close(
    *,
    last_actual_close: float,
    predicted_close: float,
    horizon: int,
    interval_calibration: Dict[str, object],
) -> Tuple[float, float]:
    by_horizon = interval_calibration.get("byHorizon", {})
    calibration_entry = by_horizon.get(str(min(max(horizon, 1), CALIBRATION_MAX_HORIZON)))
    if not calibration_entry or last_actual_close <= 0:
        rounded = round(float(predicted_close), 4)
        return rounded, rounded

    cumulative_return = (predicted_close / last_actual_close) - 1
    lower_close = last_actual_close * (1 + cumulative_return + calibration_entry["lowerResidualQuantile"])
    upper_close = last_actual_close * (1 + cumulative_return + calibration_entry["upperResidualQuantile"])
    lower = round(max(float(min(lower_close, upper_close)), 0.01), 4)
    upper = round(max(float(max(lower_close, upper_close)), 0.01), 4)
    return lower, upper


async def train_random_forest_forecaster(
    *,
    symbols: Optional[List[str]] = None,
    version: Optional[str] = None,
    lookback_days: Optional[int] = None,
) -> Dict[str, object]:
    libs = _require_ml_dependencies()
    joblib = libs["joblib"]

    requested_symbols = [symbol.strip().upper() for symbol in symbols] if symbols else None
    training_symbols = requested_symbols or get_training_universe_symbols()
    if not training_symbols:
        raise PredictionModelError("No training symbols are available.")

    end_date = date.today()
    start_date = end_date - timedelta(days=lookback_days or settings.prediction_training_lookback_days)

    symbol_histories = await _fetch_symbol_histories(training_symbols, start=start_date, end=end_date)
    benchmark_histories = await _fetch_symbol_histories(BENCHMARK_SYMBOLS, start=start_date, end=end_date)

    usable_histories = {
        symbol: rows
        for symbol, rows in symbol_histories.items()
        if len(rows) >= MINIMUM_USABLE_HISTORY_DAYS
    }
    if not usable_histories:
        raise PredictionModelError("No training symbols have enough historical data for the forecasting model.")

    symbol_feature_symbols = sorted(usable_histories.keys())
    dataset, feature_columns, symbol_feature_symbols = build_training_dataset(
        usable_histories,
        benchmark_histories,
        min_history=MINIMUM_HISTORY_INDEX,
        target_horizons=TARGET_HORIZONS,
        symbol_feature_symbols=symbol_feature_symbols,
    )
    if len(dataset) < 200:
        raise PredictionModelError("Training dataset is too small to fit the forecasting model.")

    dataset = dataset.sort_values(["date", "symbol"]).reset_index(drop=True)
    train_dates, holdout_dates, train_frame, test_frame = _build_date_windows(dataset)
    walk_forward_folds = _build_walk_forward_folds(train_dates)

    best_candidate, candidate_results = _evaluate_model_candidates(
        train_frame,
        feature_columns,
        walk_forward_folds,
        target_col=_target_column_for_horizon(1),
    )
    selected_model_type = str(best_candidate["modelType"])

    direct_models: Dict[str, object] = {}
    direct_horizon_params: Dict[str, Dict[str, object]] = {}
    direct_horizon_metrics: Dict[str, Dict[str, float]] = {}
    direct_horizon_model_types: Dict[str, str] = {}
    direct_horizon_search: Dict[str, Dict[str, object]] = {}
    anchor_residuals: Dict[int, Sequence[float]] = {}
    primary_eval_frame = None
    primary_metrics: Dict[str, float] = {}
    primary_feature_importances: List[Dict[str, float]] = []

    for horizon in DIRECT_HORIZONS:
        target_col = _target_column_for_horizon(horizon)
        best_horizon_candidate, horizon_candidates = _evaluate_model_candidates(
            train_frame,
            feature_columns,
            walk_forward_folds,
            target_col=target_col,
            allowed_model_types=[selected_model_type],
        )
        best_params = dict(best_horizon_candidate["params"])
        trained_model = _train_model(
            train_frame,
            feature_columns,
            target_col=target_col,
            model_type=selected_model_type,
            params=best_params,
        )

        metrics, predicted_returns, predicted_prices, eval_frame = _evaluate_direct_horizon_model(
            trained_model,
            test_frame,
            feature_columns,
            horizon=horizon,
        )

        direct_models[str(horizon)] = trained_model
        direct_horizon_params[str(horizon)] = best_params
        direct_horizon_metrics[str(horizon)] = metrics
        direct_horizon_model_types[str(horizon)] = selected_model_type
        direct_horizon_search[str(horizon)] = {
            "winner": best_horizon_candidate,
            "candidateResults": horizon_candidates,
        }
        anchor_residuals[horizon] = test_frame[target_col].to_numpy(dtype=float) - predicted_returns

        if horizon == 1:
            primary_eval_frame = eval_frame
            primary_metrics = metrics
            primary_feature_importances = _build_feature_importances(feature_columns, trained_model)

    if primary_eval_frame is None:
        raise PredictionModelError("Unable to evaluate the primary forecasting model.")

    holdout_strategy_metrics = _compute_holdout_strategy_metrics(primary_eval_frame)
    primary_metrics = {
        **primary_metrics,
        **holdout_strategy_metrics,
    }
    per_symbol_metrics = _build_per_symbol_metrics(primary_eval_frame)
    per_symbol_series = _build_per_symbol_series(primary_eval_frame)
    interval_calibration = _build_interval_calibration(anchor_residuals, interval_level=DEFAULT_INTERVAL_LEVEL)

    version_name = version or _default_model_version()
    output_dir = _version_dir(version_name)
    output_dir.mkdir(parents=True, exist_ok=True)

    model_path = output_dir / "model.joblib"
    metadata_path = output_dir / "metadata.json"
    importance_path = output_dir / "feature_importances.json"
    plot_path = output_dir / "actual_vs_predicted.png"
    model_comparison_path = output_dir / "model_comparison.json"
    per_symbol_metrics_path = output_dir / "per_symbol_metrics.json"
    per_symbol_series_path = output_dir / "per_symbol_actual_vs_predicted.json"
    holdout_strategy_path = output_dir / "holdout_strategy_metrics.json"
    interval_calibration_path = output_dir / "interval_calibration.json"
    top_symbol_chart_dir = output_dir / "top_symbol_charts"
    top_symbol_chart_dir.mkdir(parents=True, exist_ok=True)

    model_bundle = {
        "primaryModel": direct_models["1"],
        "directModels": direct_models,
        "modelType": selected_model_type,
    }
    joblib.dump(model_bundle, model_path)
    importance_path.write_text(json.dumps(primary_feature_importances, indent=2))
    model_comparison_path.write_text(
        json.dumps(
            {
                "selectionHorizon": 1,
                "winner": best_candidate,
                "candidateResults": candidate_results,
                "selectedModelType": selected_model_type,
                "directHorizonSearch": direct_horizon_search,
            },
            indent=2,
        )
    )
    per_symbol_metrics_path.write_text(json.dumps(per_symbol_metrics, indent=2))
    per_symbol_series_path.write_text(json.dumps(per_symbol_series, indent=2))
    holdout_strategy_path.write_text(json.dumps(holdout_strategy_metrics, indent=2))
    interval_calibration_path.write_text(json.dumps(interval_calibration, indent=2))

    holdout_plot_frame = _build_holdout_plot_frame(primary_eval_frame)
    _save_average_plot(plot_path, holdout_plot_frame, model_label=_model_display_name(selected_model_type))

    top_symbols = sorted(
        per_symbol_metrics.items(),
        key=lambda item: item[1]["observationCount"],
        reverse=True,
    )[:TOP_SYMBOL_CHART_LIMIT]
    for symbol, _ in top_symbols:
        symbol_frame = primary_eval_frame[primary_eval_frame["symbol"] == symbol].copy()
        _save_symbol_plot(
            top_symbol_chart_dir / f"{symbol.lower()}_actual_vs_predicted.png",
            symbol_frame.sort_values("date"),
            model_label=_model_display_name(selected_model_type),
            symbol=symbol,
        )

    trained_through = dataset["date"].max()
    if hasattr(trained_through, "date"):
        trained_through = trained_through.date()

    training_universe_source = "manual_symbols" if requested_symbols else (
        "env_override" if settings.prediction_training_universe else "manifest_default"
    )
    metadata = {
        "modelVersion": version_name,
        "modelType": selected_model_type,
        "directHorizonModelTypes": direct_horizon_model_types,
        "featureColumns": feature_columns,
        "symbolFeatureSymbols": symbol_feature_symbols,
        "splitStrategy": "date_grouped_holdout",
        "walkForwardFolds": [
            {
                "trainStart": fold["trainStart"],
                "trainEnd": fold["trainEnd"],
                "validationStart": fold["validationStart"],
                "validationEnd": fold["validationEnd"],
            }
            for fold in walk_forward_folds
        ],
        "trainWindow": {
            "start": str(train_dates[0].date()),
            "end": str(train_dates[-1].date()),
        },
        "testWindow": {
            "start": str(holdout_dates[0].date()),
            "end": str(holdout_dates[-1].date()),
        },
        "metrics": primary_metrics,
        "hyperparameters": direct_horizon_params,
        "trainedThroughDate": str(trained_through),
        "featureImportancePath": str(importance_path),
        "plotPath": str(plot_path),
        "modelComparisonPath": str(model_comparison_path),
        "perSymbolMetricsPath": str(per_symbol_metrics_path),
        "perSymbolSeriesPath": str(per_symbol_series_path),
        "holdoutStrategyMetricsPath": str(holdout_strategy_path),
        "intervalCalibrationPath": str(interval_calibration_path),
        "symbols": training_symbols,
        "usedSymbols": symbol_feature_symbols,
        "benchmarks": list(BENCHMARK_SYMBOLS),
        "supportedDirectHorizons": list(DIRECT_HORIZONS),
        "predictionIntervalLevel": DEFAULT_INTERVAL_LEVEL,
        "intervalSource": "walk_forward_residual_quantiles",
        "trainingUniverseSource": training_universe_source,
        "trainingUniversePath": str(settings.prediction_training_universe_path),
        "minimumUsableHistoryDays": MINIMUM_USABLE_HISTORY_DAYS,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2))
    _latest_model_pointer().write_text(json.dumps({"modelVersion": version_name}, indent=2))
    return metadata


_LOADED_MODEL_CACHE_MAX_SIZE = 1
_loaded_model_cache: "OrderedDict[str, Tuple[int, Any, Any, Any, Any]]" = OrderedDict()


def _prune_loaded_model_cache() -> None:
    while len(_loaded_model_cache) > _LOADED_MODEL_CACHE_MAX_SIZE:
        _loaded_model_cache.popitem(last=False)


def _resolve_model_version(model_version: Optional[str]) -> str:
    if model_version:
        return model_version
    latest_pointer = _latest_model_pointer()
    if not latest_pointer.exists():
        raise PredictionModelError("No trained forecasting model is available.")
    return json.loads(latest_pointer.read_text()).get("modelVersion")


def load_trained_model(model_version: Optional[str] = None):
    libs = _require_ml_dependencies()
    joblib = libs["joblib"]

    version = _resolve_model_version(model_version)

    version_dir = _version_dir(version)
    model_path = version_dir / "model.joblib"
    metadata_path = version_dir / "metadata.json"
    importance_path = version_dir / "feature_importances.json"
    interval_calibration_path = version_dir / "interval_calibration.json"

    if not model_path.exists() or not metadata_path.exists():
        raise PredictionModelError("Requested forecasting model artifacts are missing.")

    current_mtime_ns = model_path.stat().st_mtime_ns
    cached = _loaded_model_cache.get(version)
    if cached and cached[0] == current_mtime_ns:
        _loaded_model_cache.move_to_end(version)
        _, bundle, metadata, importances, calibration = cached
        return bundle, metadata, importances, calibration

    loaded_model = joblib.load(model_path)
    if isinstance(loaded_model, dict) and "primaryModel" in loaded_model:
        model_bundle = loaded_model
    else:
        model_bundle = {
            "primaryModel": loaded_model,
            "directModels": {"1": loaded_model},
            "modelType": "RandomForestRegressor",
        }

    metadata = json.loads(metadata_path.read_text())
    feature_importances = json.loads(importance_path.read_text()) if importance_path.exists() else []
    interval_calibration = json.loads(interval_calibration_path.read_text()) if interval_calibration_path.exists() else {}

    _loaded_model_cache[version] = (
        current_mtime_ns,
        model_bundle,
        metadata,
        feature_importances,
        interval_calibration,
    )
    _loaded_model_cache.move_to_end(version)
    _prune_loaded_model_cache()
    return model_bundle, metadata, feature_importances, interval_calibration


def _business_day_range(start_day: date, count: int) -> List[date]:
    trading_days: List[date] = []
    cursor = start_day
    while len(trading_days) < count:
        if cursor.weekday() < 5:
            trading_days.append(cursor)
        cursor += timedelta(days=1)
    return trading_days


async def _forecast_dates(last_date: date, horizon_days: int) -> List[date]:
    try:
        calendar_days = await fetch_market_calendar(
            start=last_date + timedelta(days=1),
            end=last_date + timedelta(days=max(60, horizon_days * 3)),
        )
        filtered = [day for day in calendar_days if day > last_date]
        if len(filtered) >= horizon_days:
            return filtered[:horizon_days]
    except Exception:
        pass

    return _business_day_range(last_date + timedelta(days=1), horizon_days)


def _coerce_feature_frame(feature_columns: List[str], row: Dict[str, float]):
    libs = _require_ml_dependencies()
    pd = libs["pd"]
    return pd.DataFrame([{column: row.get(column, 0.0) for column in feature_columns}])


async def predict_forecast(request: PredictionRequest) -> PredictionResponse:
    model_bundle, metadata, feature_importances, interval_calibration = load_trained_model(request.modelVersion)
    asset_class = get_symbol_asset_class(request.symbol)
    symbol = normalize_catalog_symbol(request.symbol, asset_class)

    end_date = date.today()
    fetch_days = max(request.historyWindowDays + 365, 730)
    start_date = end_date - timedelta(days=fetch_days)

    try:
        symbol_rows = await fetch_daily_bar_rows(
            symbol,
            start=start_date,
            end=end_date,
            asset_class=asset_class,
        )
        benchmark_rows = await _fetch_symbol_histories(BENCHMARK_SYMBOLS, start=start_date, end=end_date)
    except AlpacaMarketDataError:
        raise
    except Exception as exc:
        raise PredictionModelError(str(exc))

    feature_columns = metadata.get("featureColumns") or []
    if not feature_columns:
        raise PredictionModelError("Stored model metadata is missing feature columns.")

    symbol_feature_symbols = metadata.get("symbolFeatureSymbols") or []
    benchmark_snapshot = build_benchmark_feature_snapshot(benchmark_rows)
    synthetic_rows = list(symbol_rows)
    last_actual_close = float(symbol_rows[-1]["close"])

    forecast_dates = await _forecast_dates(symbol_rows[-1]["date"], request.horizonDays)
    direct_models = model_bundle.get("directModels", {})
    available_direct_horizons = sorted(int(key) for key in direct_models.keys()) or [1]
    primary_model = direct_models.get("1") or model_bundle.get("primaryModel")
    if primary_model is None:
        raise PredictionModelError("Stored forecasting model bundle is missing the primary model.")

    latest_actual_features = build_latest_symbol_feature_snapshot(
        symbol_rows,
        symbol=symbol,
        symbol_feature_symbols=symbol_feature_symbols,
    )
    base_feature_row = _coerce_feature_frame(feature_columns, {**latest_actual_features, **benchmark_snapshot})

    recursive_closes: List[float] = []
    for forecast_date in forecast_dates:
        latest_symbol_features = build_latest_symbol_feature_snapshot(
            synthetic_rows,
            symbol=symbol,
            symbol_feature_symbols=symbol_feature_symbols,
        )
        feature_row = _coerce_feature_frame(feature_columns, {**latest_symbol_features, **benchmark_snapshot})
        predicted_return = float(primary_model.predict(feature_row)[0])
        previous_close = float(synthetic_rows[-1]["close"])
        predicted_close = previous_close * (1 + predicted_return)
        recursive_closes.append(predicted_close)

        synthetic_rows.append(
            {
                "date": forecast_date,
                "open": predicted_close,
                "high": predicted_close,
                "low": predicted_close,
                "close": predicted_close,
                "volume": synthetic_rows[-1].get("volume", 0),
            }
        )

    forecast_method_used = "recursive_1d"
    model_type = metadata.get("modelType")
    if request.horizonDays == 1 and "1" in direct_models:
        direct_return = float(direct_models["1"].predict(base_feature_row)[0])
        recursive_closes = [last_actual_close * (1 + direct_return)]
        forecast_method_used = "direct_1d"
        model_type = metadata.get("directHorizonModelTypes", {}).get("1", model_type)
    elif request.horizonDays in DIRECT_HORIZONS and str(request.horizonDays) in direct_models:
        direct_return = float(direct_models[str(request.horizonDays)].predict(base_feature_row)[0])
        anchored_terminal_close = last_actual_close * (1 + direct_return)
        recursive_closes = _apply_recursive_anchor(last_actual_close, recursive_closes, anchored_terminal_close)
        forecast_method_used = f"direct_{request.horizonDays}d_anchored"
        model_type = metadata.get("directHorizonModelTypes", {}).get(str(request.horizonDays), model_type)

    forecast_series: List[ForecastSeriesPoint] = []
    previous_close = last_actual_close
    for index, (forecast_date, predicted_close) in enumerate(zip(forecast_dates, recursive_closes), start=1):
        predicted_return = ((predicted_close / previous_close) - 1) if previous_close else 0.0
        predicted_close_low, predicted_close_high = _interval_bounds_for_close(
            last_actual_close=last_actual_close,
            predicted_close=predicted_close,
            horizon=index,
            interval_calibration=interval_calibration,
        )
        forecast_series.append(
            ForecastSeriesPoint(
                date=forecast_date,
                predictedClose=round(predicted_close, 4),
                predictedReturnPct=round(predicted_return * 100, 4),
                predictedCloseLow=predicted_close_low,
                predictedCloseHigh=predicted_close_high,
            )
        )
        previous_close = predicted_close

    predicted_next_day_return = forecast_series[0].predictedReturnPct if forecast_series else 0.0
    predicted_next_day_close = forecast_series[0].predictedClose if forecast_series else last_actual_close
    predicted_end_close = forecast_series[-1].predictedClose if forecast_series else last_actual_close
    predicted_return_pct_over_horizon = (
        ((predicted_end_close - last_actual_close) / last_actual_close) * 100 if last_actual_close else 0.0
    )

    historical_rows = symbol_rows[-request.historyWindowDays :]
    historical_series = [
        PriceSeriesPoint(date=row["date"], close=round(float(row["close"]), 4))
        for row in historical_rows
    ]

    projected_portfolio_series = None
    projected_end_value = None
    projected_growth_pct = None
    if request.initialAmount is not None and last_actual_close > 0:
        shares = request.initialAmount / last_actual_close
        projected_portfolio_series = [
            ProjectedPortfolioPoint(
                date=point.date,
                projectedValue=round(shares * point.predictedClose, 4),
            )
            for point in forecast_series
        ]
        if projected_portfolio_series:
            projected_end_value = projected_portfolio_series[-1].projectedValue
            projected_growth_pct = round(
                ((projected_end_value - request.initialAmount) / request.initialAmount) * 100,
                4,
            )

    metrics_payload = metadata.get("metrics", {})

    return PredictionResponse(
        symbol=symbol,
        lastActualClose=round(last_actual_close, 4),
        predictedNextDayReturn=round(predicted_next_day_return, 4),
        predictedNextDayClose=round(predicted_next_day_close, 4),
        forecastHorizonDays=request.horizonDays,
        historicalSeries=historical_series,
        forecastSeries=forecast_series,
        predictedReturnPctOverHorizon=round(predicted_return_pct_over_horizon, 4),
        metrics=PredictionMetrics(**metrics_payload),
        featureImportances=[
            FeatureImportancePoint(**item)
            for item in feature_importances[:10]
        ],
        modelVersion=metadata["modelVersion"],
        trainedThroughDate=datetime.strptime(
            metadata["trainedThroughDate"], "%Y-%m-%d"
        ).date(),
        projectedPortfolioSeries=projected_portfolio_series,
        projectedEndValue=projected_end_value,
        projectedGrowthPct=projected_growth_pct,
        modelType=model_type,
        forecastMethodUsed=forecast_method_used,
        supportedDirectHorizons=[int(item) for item in metadata.get("supportedDirectHorizons", available_direct_horizons)],
        predictionIntervalLevel=metadata.get("predictionIntervalLevel"),
        intervalSource=metadata.get("intervalSource"),
    )
