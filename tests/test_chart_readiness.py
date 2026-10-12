import asyncio
import time
import unittest
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from app.schemas.instruments import InstrumentRange
from app.services import chart_readiness
from app.services.chart_readiness import classify_history_readiness, get_chart_readiness_batch


def _points(*, end: date, days: int, spacing: int = 1, base: float = 100.0):
    start = end - timedelta(days=days)
    result = []
    cursor = start
    index = 0
    while cursor <= end:
        result.append((cursor, base + index * 0.25))
        cursor += timedelta(days=spacing)
        index += 1
    return result


class ChartReadinessTests(unittest.TestCase):
    def setUp(self):
        chart_readiness._readiness_cache.clear()

    @patch("app.services.chart_readiness.get_symbol_asset_class", return_value="us_equity")
    @patch("app.services.chart_readiness.get_symbol_metadata")
    def test_classifies_partial_range_availability_from_coverage_and_counts(
        self,
        mock_metadata,
        _mock_asset_class,
    ):
        mock_metadata.return_value = {"symbol": "AAPL", "status": "active", "tradable": True}
        end = date(2026, 10, 12)

        readiness = classify_history_readiness(
            "AAPL",
            _points(end=end, days=190, spacing=2),
            end_date=end,
        )

        self.assertTrue(readiness.chartReady)
        self.assertEqual(
            readiness.availableRanges,
            [
                InstrumentRange.one_week,
                InstrumentRange.one_month,
                InstrumentRange.three_months,
                InstrumentRange.six_months,
                InstrumentRange.max_range,
            ],
        )
        self.assertEqual(readiness.defaultRange, InstrumentRange.six_months)

    @patch("app.services.chart_readiness.get_symbol_asset_class", return_value="crypto")
    @patch("app.services.chart_readiness.get_symbol_metadata")
    def test_rejects_flat_or_too_short_crypto_history(
        self,
        mock_metadata,
        _mock_asset_class,
    ):
        mock_metadata.return_value = {"symbol": "BTC/USD", "status": "active", "tradable": True}
        end = date(2026, 10, 12)

        short = classify_history_readiness(
            "BTC/USD",
            [(end - timedelta(days=1), 10.0), (end, 11.0)],
            end_date=end,
        )
        flat = classify_history_readiness(
            "BTC/USD",
            [(end - timedelta(days=offset), 10.0) for offset in range(7)],
            end_date=end,
        )

        self.assertFalse(short.chartReady)
        self.assertIn("Not enough", short.unavailableReason)
        self.assertFalse(flat.chartReady)
        self.assertIn("usable price range", flat.unavailableReason)

    @patch("app.services.chart_readiness.get_symbol_asset_class", return_value="us_equity")
    @patch("app.services.chart_readiness.get_symbol_metadata")
    @patch("app.services.chart_readiness.fetch_daily_close_series_batch", new_callable=AsyncMock)
    def test_batch_readiness_uses_cache_and_filters_provider_failures(
        self,
        mock_fetch,
        mock_metadata,
        _mock_asset_class,
    ):
        mock_metadata.return_value = {"symbol": "AAPL", "status": "active", "tradable": True}
        end = date(2026, 10, 12)
        mock_fetch.return_value = {"AAPL": _points(end=end, days=182, spacing=2)}

        first = asyncio.run(get_chart_readiness_batch(["AAPL", "AAPL"], end_date=end))
        second = asyncio.run(get_chart_readiness_batch(["AAPL"], end_date=end))

        self.assertTrue(first["AAPL"].chartReady)
        self.assertTrue(second["AAPL"].chartReady)
        self.assertEqual(mock_fetch.await_count, 1)

        chart_readiness._readiness_cache[("AAPL", "us_equity", end.isoformat())] = (
            time.time() - chart_readiness.READINESS_SUCCESS_TTL_SECONDS - 1,
            first["AAPL"],
        )
        mock_fetch.side_effect = RuntimeError("provider unavailable")
        failed = asyncio.run(get_chart_readiness_batch(["AAPL"], end_date=end))
        self.assertFalse(failed["AAPL"].chartReady)


if __name__ == "__main__":
    unittest.main()
