from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence, Tuple


TARGET_HORIZONS: Tuple[int, ...] = tuple(range(1, 11))
EPSILON = 1e-9


def _require_dataframe_modules():
    import numpy as np
    import pandas as pd

    return pd, np


def rows_to_frame(rows: List[dict]):
    pd, _ = _require_dataframe_modules()
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame

    frame["date"] = pd.to_datetime(frame["date"])
    frame = frame.sort_values("date").reset_index(drop=True)

    for column in ("open", "high", "low", "close", "volume"):
        if column not in frame:
            if column == "volume":
                frame[column] = 0.0
            else:
                frame[column] = frame.get("close", 0.0)
        frame[column] = frame[column].astype(float)
    return frame


def _compute_rsi(close, window: int = 14):
    _, np = _require_dataframe_modules()
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window).mean()
    avg_loss = loss.rolling(window).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50.0)


def _target_columns(target_horizons: Sequence[int]) -> List[str]:
    columns: List[str] = []
    for horizon in target_horizons:
        if horizon == 1:
            columns.extend(["next_close", "target_next_return"])
        else:
            columns.extend([f"next_close_{horizon}d", f"target_next_return_{horizon}d"])
    return columns


def _symbol_feature_columns(symbol_feature_symbols: Sequence[str]) -> List[str]:
    ordered = [symbol.strip().upper() for symbol in symbol_feature_symbols if symbol]
    return [f"symbol_{symbol.lower()}" for symbol in ordered] + ["symbol_other_symbol"]


def _encode_symbol_features(symbol: str, symbol_feature_symbols: Sequence[str]) -> Dict[str, float]:
    normalized_symbol = symbol.strip().upper()
    encoded: Dict[str, float] = {}
    ordered = [item.strip().upper() for item in symbol_feature_symbols if item]
    matched = False
    for candidate in ordered:
        column = f"symbol_{candidate.lower()}"
        is_match = normalized_symbol == candidate
        encoded[column] = 1.0 if is_match else 0.0
        matched = matched or is_match
    encoded["symbol_other_symbol"] = 0.0 if matched else 1.0
    return encoded


def compute_close_features(
    frame,
    *,
    prefix: str = "",
    include_target: bool = True,
    target_horizons: Sequence[int] = TARGET_HORIZONS,
):
    pd, np = _require_dataframe_modules()

    if frame.empty:
        return frame

    enriched = frame[["date", "open", "high", "low", "close", "volume"]].copy()
    open_ = enriched["open"]
    high = enriched["high"]
    low = enriched["low"]
    close = enriched["close"]
    volume = enriched["volume"]

    prev_close = close.shift(1)
    daily_return = close.pct_change()

    candle_range = (high - low).clip(lower=0)
    candle_range_pct = candle_range / close.replace(0, np.nan)
    close_position = ((close - low) / candle_range.replace(0, np.nan)).clip(0, 1)
    body = (close - open_).abs()
    body_pct = body / close.replace(0, np.nan)
    upper_body = pd.concat([open_, close], axis=1).max(axis=1)
    lower_body = pd.concat([open_, close], axis=1).min(axis=1)
    upper_wick = (high - upper_body).clip(lower=0)
    lower_wick = (lower_body - low).clip(lower=0)
    intraday_return = (close - open_) / open_.replace(0, np.nan)
    overnight_gap = (open_ - prev_close) / prev_close.replace(0, np.nan)

    true_range = pd.concat(
        [
            candle_range,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    true_range_ratio = true_range / close.replace(0, np.nan)

    enriched[f"{prefix}intraday_return"] = intraday_return
    enriched[f"{prefix}overnight_gap"] = overnight_gap
    enriched[f"{prefix}range_pct"] = candle_range_pct
    enriched[f"{prefix}close_position_in_range"] = close_position.fillna(0.5)
    enriched[f"{prefix}body_pct"] = body_pct
    enriched[f"{prefix}upper_wick_pct"] = upper_wick / close.replace(0, np.nan)
    enriched[f"{prefix}lower_wick_pct"] = lower_wick / close.replace(0, np.nan)
    enriched[f"{prefix}volume_change_1d"] = volume.pct_change()
    enriched[f"{prefix}true_range_ratio"] = true_range_ratio
    enriched[f"{prefix}atr_ratio_14"] = true_range.rolling(14).mean() / close.replace(0, np.nan)

    for lag in (1, 2, 5, 10, 20):
        enriched[f"{prefix}return_{lag}d"] = close.pct_change(lag)

    for window in (5, 10, 20):
        enriched[f"{prefix}volatility_{window}d"] = daily_return.rolling(window).std() * np.sqrt(252)
        enriched[f"{prefix}range_mean_{window}d"] = candle_range_pct.rolling(window).mean()
        enriched[f"{prefix}range_std_{window}d"] = candle_range_pct.rolling(window).std()
        enriched[f"{prefix}volume_std_{window}d"] = volume.pct_change().rolling(window).std()

    for window in (5, 10, 20, 50):
        sma = close.rolling(window).mean()
        enriched[f"{prefix}sma_ratio_{window}"] = (close / sma) - 1

    for span in (5, 10, 20):
        ema = close.ewm(span=span, adjust=False).mean()
        enriched[f"{prefix}ema_ratio_{span}"] = (close / ema) - 1

    for window in (5, 20):
        avg_volume = volume.rolling(window).mean().replace(0, np.nan)
        enriched[f"{prefix}relative_volume_{window}"] = volume / avg_volume

    enriched[f"{prefix}rsi_14"] = _compute_rsi(close, 14)
    macd = close.ewm(span=12, adjust=False).mean() - close.ewm(span=26, adjust=False).mean()
    macd_signal = macd.ewm(span=9, adjust=False).mean()
    enriched[f"{prefix}macd_gap"] = macd - macd_signal

    rolling_mean_20 = close.rolling(20).mean()
    rolling_std_20 = close.rolling(20).std()
    upper_band = rolling_mean_20 + (2 * rolling_std_20)
    lower_band = rolling_mean_20 - (2 * rolling_std_20)
    band_width = (upper_band - lower_band).replace(0, np.nan)
    enriched[f"{prefix}bollinger_position"] = ((close - lower_band) / band_width).clip(0, 1)

    enriched[f"{prefix}day_of_week"] = enriched["date"].dt.dayofweek
    enriched[f"{prefix}month"] = enriched["date"].dt.month

    if include_target:
        for horizon in target_horizons:
            next_close_column = "next_close" if horizon == 1 else f"next_close_{horizon}d"
            target_column = "target_next_return" if horizon == 1 else f"target_next_return_{horizon}d"
            enriched[next_close_column] = close.shift(-horizon)
            enriched[target_column] = enriched[next_close_column] / close - 1

    enriched = enriched.replace([np.inf, -np.inf], np.nan)
    return enriched


def _benchmark_feature_frames(
    benchmark_rows: Dict[str, List[dict]],
    *,
    target_horizons: Sequence[int] = TARGET_HORIZONS,
):
    frames = {}
    for symbol, rows in benchmark_rows.items():
        benchmark_frame = compute_close_features(
            rows_to_frame(rows),
            prefix=f"{symbol.lower()}_",
            include_target=False,
            target_horizons=target_horizons,
        )
        feature_columns = [
            column
            for column in benchmark_frame.columns
            if column not in {"open", "high", "low", "close", "volume"}
        ]
        frames[symbol] = benchmark_frame[feature_columns]
    return frames


def build_training_dataset(
    symbol_rows: Dict[str, List[dict]],
    benchmark_rows: Dict[str, List[dict]],
    *,
    min_history: int = 252,
    target_horizons: Sequence[int] = TARGET_HORIZONS,
    symbol_feature_symbols: Optional[Sequence[str]] = None,
):
    pd, _ = _require_dataframe_modules()

    benchmark_frames = _benchmark_feature_frames(benchmark_rows, target_horizons=target_horizons)
    datasets = []
    used_symbols: List[str] = []

    for symbol, rows in symbol_rows.items():
        frame = compute_close_features(
            rows_to_frame(rows),
            include_target=True,
            target_horizons=target_horizons,
        )
        if frame.empty:
            continue

        frame["symbol"] = symbol
        frame["history_index"] = range(len(frame))

        for benchmark_frame in benchmark_frames.values():
            frame = frame.merge(benchmark_frame, on="date", how="left")

        frame = frame[frame["history_index"] >= min_history]
        frame = frame.dropna().reset_index(drop=True)
        if not frame.empty:
            datasets.append(frame)
            used_symbols.append(symbol.strip().upper())

    if not datasets:
        raise ValueError("Not enough historical data to build the training dataset.")

    ordered_symbols = sorted({symbol.strip().upper() for symbol in (symbol_feature_symbols or used_symbols) if symbol})
    dataset = pd.concat(datasets, ignore_index=True).sort_values(["date", "symbol"]).reset_index(drop=True)
    for column, value in _encode_symbol_features("placeholder", ordered_symbols).items():
        dataset[column] = 0.0
    for symbol in ordered_symbols:
        dataset.loc[dataset["symbol"] == symbol, f"symbol_{symbol.lower()}"] = 1.0
    dataset["symbol_other_symbol"] = (~dataset["symbol"].isin(ordered_symbols)).astype(float)

    excluded_columns = {
        "date",
        "symbol",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "history_index",
        *_target_columns(target_horizons),
    }
    feature_columns = [
        column
        for column in dataset.columns
        if column not in excluded_columns
    ]
    return dataset, feature_columns, ordered_symbols


def build_latest_feature_row(
    symbol_rows: List[dict],
    benchmark_rows: Dict[str, List[dict]],
    feature_columns: List[str],
    *,
    symbol: str,
    symbol_feature_symbols: Optional[Sequence[str]] = None,
):
    frame = compute_close_features(rows_to_frame(symbol_rows), include_target=False)
    frame["history_index"] = range(len(frame))

    for benchmark_frame in _benchmark_feature_frames(benchmark_rows).values():
        frame = frame.merge(benchmark_frame, on="date", how="left")

    frame = frame[frame["history_index"] >= 252].dropna().reset_index(drop=True)
    if frame.empty:
        raise ValueError("Not enough historical data to generate prediction features.")

    latest = frame.iloc[-1].to_dict()
    latest.update(_encode_symbol_features(symbol, symbol_feature_symbols or []))
    return {
        column: latest[column]
        for column in feature_columns
        if column in latest
    }


def build_benchmark_feature_snapshot(benchmark_rows: Dict[str, List[dict]]) -> Dict[str, float]:
    snapshot: Dict[str, float] = {}
    for symbol, rows in benchmark_rows.items():
        frame = compute_close_features(
            rows_to_frame(rows),
            prefix=f"{symbol.lower()}_",
            include_target=False,
        ).dropna()
        if frame.empty:
            raise ValueError(f"Not enough benchmark history for {symbol}.")
        latest = frame.iloc[-1]
        for column in frame.columns:
            if column not in {"date", "open", "high", "low", "close", "volume"}:
                snapshot[column] = latest[column]
    return snapshot


def build_latest_symbol_feature_snapshot(
    symbol_rows: List[dict],
    *,
    symbol: str,
    symbol_feature_symbols: Optional[Sequence[str]] = None,
) -> Dict[str, float]:
    frame = compute_close_features(rows_to_frame(symbol_rows), include_target=False)
    frame["history_index"] = range(len(frame))
    frame = frame[frame["history_index"] >= 252].dropna().reset_index(drop=True)
    if frame.empty:
        raise ValueError("Not enough historical data to generate prediction features.")
    latest = frame.iloc[-1].to_dict()
    result = {
        column: latest[column]
        for column in frame.columns
        if column not in {"date", "open", "high", "low", "close", "volume", "history_index"}
    }
    result.update(_encode_symbol_features(symbol, symbol_feature_symbols or []))
    return result
