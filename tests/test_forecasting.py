import asyncio
import json
import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock, patch

try:
    from test_auth import BaseAPITestCase, ML_DEPENDENCIES_AVAILABLE, _generate_synthetic_rows
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase, ML_DEPENDENCIES_AVAILABLE, _generate_synthetic_rows


class ForecastModelCacheTests(unittest.TestCase):
    def setUp(self):
        from app.forecasting import training

        training._loaded_model_cache.clear()

    def tearDown(self):
        from app.forecasting import training

        training._loaded_model_cache.clear()

    def test_loaded_model_cache_evicts_old_versions(self):
        from app.forecasting import training

        class DummyJoblib:
            def load(self, path):
                return {"primaryModel": f"bundle:{Path(path).parent.name}"}

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            for version in ("v1", "v2", "v3"):
                version_dir = root / version
                version_dir.mkdir(parents=True, exist_ok=True)
                (version_dir / "model.joblib").write_text("dummy")
                (version_dir / "metadata.json").write_text(json.dumps({"modelVersion": version}))

            with patch.object(training, "_require_ml_dependencies", return_value={"joblib": DummyJoblib()}), patch.object(
                training,
                "_version_dir",
                side_effect=lambda version: root / version,
            ):
                training.load_trained_model("v1")
                training.load_trained_model("v2")
                training.load_trained_model("v3")

        self.assertEqual(list(training._loaded_model_cache.keys()), ["v3"])


@unittest.skipUnless(ML_DEPENDENCIES_AVAILABLE, "ML dependencies are not installed")
class PredictionPipelineTests(BaseAPITestCase):
    @staticmethod
    def _mock_bars_for_symbol(symbol: str):
        base = {
            "AAPL": (100.0, 0.0018),
            "MSFT": (210.0, 0.0012),
            "SPY": (400.0, 0.0006),
            "QQQ": (350.0, 0.0008),
        }
        start_price, slope = base.get(symbol, (150.0, 0.001))
        return _generate_synthetic_rows(date(2022, 1, 3), 420, start_price, slope)

    @patch("app.forecasting.training.fetch_daily_bar_rows", new_callable=AsyncMock)
    def test_training_pipeline_creates_artifacts(self, mock_fetch_daily_bar_rows):
        async def side_effect(symbol, start=None, end=None, asset_class=None):
            return self._mock_bars_for_symbol(symbol)

        mock_fetch_daily_bar_rows.side_effect = side_effect

        with tempfile.TemporaryDirectory() as temp_dir, patch.dict(
            os.environ,
            {"PREDICTION_MODEL_DIR": temp_dir},
            clear=False,
        ):
            from app.forecasting.training import train_random_forest_forecaster

            metadata = asyncio.run(
                train_random_forest_forecaster(
                    symbols=["AAPL", "MSFT"],
                    version="test_model",
                    lookback_days=900,
                )
            )

            self.assertEqual(metadata["modelVersion"], "test_model")
            self.assertEqual(metadata["splitStrategy"], "date_grouped_holdout")
            self.assertEqual(metadata["supportedDirectHorizons"], [1, 5, 10])
            self.assertIn("modelType", metadata)
            self.assertIn("walkForwardFolds", metadata)
            self.assertLess(metadata["trainWindow"]["end"], metadata["testWindow"]["start"])
            model_dir = os.path.join(temp_dir, "test_model")
            self.assertTrue(os.path.exists(os.path.join(model_dir, "model.joblib")))
            self.assertTrue(os.path.exists(os.path.join(model_dir, "metadata.json")))
            self.assertTrue(os.path.exists(os.path.join(model_dir, "feature_importances.json")))
            self.assertTrue(os.path.exists(os.path.join(model_dir, "model_comparison.json")))
            self.assertTrue(os.path.exists(os.path.join(model_dir, "per_symbol_metrics.json")))
            self.assertTrue(os.path.exists(os.path.join(model_dir, "per_symbol_actual_vs_predicted.json")))
            self.assertTrue(os.path.exists(os.path.join(model_dir, "holdout_strategy_metrics.json")))
            self.assertTrue(os.path.exists(os.path.join(model_dir, "interval_calibration.json")))
            self.assertTrue(os.path.isdir(os.path.join(model_dir, "top_symbol_charts")))

            with open(os.path.join(model_dir, "model_comparison.json")) as handle:
                comparison = json.loads(handle.read())
            self.assertIn("winner", comparison)
            self.assertGreater(len(comparison["candidateResults"]), 0)

    def test_feature_engineering_builds_expected_columns_without_leakage(self):
        from app.forecasting.feature_engineering import build_training_dataset

        symbol_rows = {
            "AAPL": self._mock_bars_for_symbol("AAPL"),
            "MSFT": self._mock_bars_for_symbol("MSFT"),
        }
        benchmark_rows = {
            "SPY": self._mock_bars_for_symbol("SPY"),
            "QQQ": self._mock_bars_for_symbol("QQQ"),
        }

        dataset, feature_columns, symbol_feature_symbols = build_training_dataset(symbol_rows, benchmark_rows)

        self.assertIn("return_1d", feature_columns)
        self.assertIn("intraday_return", feature_columns)
        self.assertIn("relative_volume_5", feature_columns)
        self.assertIn("rsi_14", feature_columns)
        self.assertIn("spy_return_1d", feature_columns)
        self.assertIn("qqq_range_pct", feature_columns)
        self.assertIn("symbol_aapl", feature_columns)
        self.assertNotIn("target_next_return", feature_columns)
        self.assertNotIn("next_close", feature_columns)
        self.assertIn("target_next_return_5d", dataset.columns)
        self.assertEqual(symbol_feature_symbols, ["AAPL", "MSFT"])
        self.assertGreater(len(dataset), 0)

    def test_holdout_plot_frame_groups_observations_into_readable_line_series(self):
        import pandas as pd

        from app.forecasting.training import _build_holdout_plot_frame

        test_frame = pd.DataFrame(
            {
                "date": [date(2024, 4, 1), date(2024, 4, 1), date(2024, 4, 2)],
                "next_close": [100.0, 200.0, 150.0],
            }
        )
        predicted_prices = [110.0, 190.0, 140.0]

        plot_frame = _build_holdout_plot_frame(test_frame, predicted_prices)

        self.assertEqual(len(plot_frame), 2)
        self.assertEqual(plot_frame.iloc[0]["date"].date(), date(2024, 4, 1))
        self.assertAlmostEqual(plot_frame.iloc[0]["actual_next_close"], 150.0, places=4)
        self.assertAlmostEqual(plot_frame.iloc[0]["predicted_next_close"], 150.0, places=4)

    @patch("app.forecasting.training.fetch_market_calendar", new_callable=AsyncMock)
    @patch("app.forecasting.training.fetch_daily_bar_rows", new_callable=AsyncMock)
    def test_prediction_endpoint_returns_forecast_and_portfolio_growth(
        self,
        mock_fetch_daily_bar_rows,
        mock_fetch_market_calendar,
    ):
        token = self.register_and_login(email="predict@example.com")

        async def bar_side_effect(symbol, start=None, end=None, asset_class=None):
            return self._mock_bars_for_symbol(symbol)

        mock_fetch_daily_bar_rows.side_effect = bar_side_effect
        mock_fetch_market_calendar.return_value = [
            date(2024, 4, 2),
            date(2024, 4, 3),
            date(2024, 4, 4),
            date(2024, 4, 5),
            date(2024, 4, 8),
        ]

        with tempfile.TemporaryDirectory() as temp_dir, patch.dict(
            os.environ,
            {"PREDICTION_MODEL_DIR": temp_dir},
            clear=False,
        ):
            from app.forecasting.training import train_random_forest_forecaster

            asyncio.run(
                train_random_forest_forecaster(
                    symbols=["AAPL", "MSFT"],
                    version="test_model",
                    lookback_days=900,
                )
            )

            response = self.client.post(
                "/predict/forecast",
                headers=self.auth_headers(token),
                json={
                    "symbol": "AAPL",
                    "horizonDays": 5,
                    "initialAmount": 1000,
                    "historyWindowDays": 300,
                    "modelVersion": "test_model",
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["symbol"], "AAPL")
        self.assertEqual(payload["forecastHorizonDays"], 5)
        self.assertEqual(len(payload["forecastSeries"]), 5)
        self.assertGreater(len(payload["historicalSeries"]), 0)
        self.assertIn("metrics", payload)
        self.assertIn("projectedEndValue", payload)
        self.assertGreater(len(payload["featureImportances"]), 0)
        self.assertIn("modelType", payload)
        self.assertIn("forecastMethodUsed", payload)
        self.assertEqual(payload["supportedDirectHorizons"], [1, 5, 10])
        self.assertEqual(payload["predictionIntervalLevel"], 0.8)
        self.assertEqual(payload["intervalSource"], "walk_forward_residual_quantiles")
        self.assertEqual(payload["forecastMethodUsed"], "direct_5d_anchored")
        self.assertIn("predictedCloseLow", payload["forecastSeries"][0])
        self.assertIn("predictedCloseHigh", payload["forecastSeries"][0])
        self.assertLessEqual(
            payload["forecastSeries"][0]["predictedCloseLow"],
            payload["forecastSeries"][0]["predictedClose"],
        )
        self.assertGreaterEqual(
            payload["forecastSeries"][0]["predictedCloseHigh"],
            payload["forecastSeries"][0]["predictedClose"],
        )

    def test_prediction_endpoint_returns_503_when_model_artifacts_are_missing(self):
        token = self.register_and_login(email="missing-model@example.com")
        with tempfile.TemporaryDirectory() as temp_dir, patch.dict(
            os.environ,
            {"PREDICTION_MODEL_DIR": temp_dir},
            clear=False,
        ):
            response = self.client.post(
                "/predict/forecast",
                headers=self.auth_headers(token),
                json={
                    "symbol": "AAPL",
                    "horizonDays": 5,
                    "historyWindowDays": 300,
                },
            )

        self.assertEqual(response.status_code, 503)
