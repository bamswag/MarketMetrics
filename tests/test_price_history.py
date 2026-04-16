import asyncio
import time
import unittest
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from app.services import price_history as price_history_service


class PriceHistoryCacheTests(unittest.TestCase):
    def setUp(self):
        price_history_service._history_cache.clear()
        price_history_service._history_locks.clear()

    def tearDown(self):
        price_history_service._history_cache.clear()
        price_history_service._history_locks.clear()

    @patch("app.services.price_history.fetch_daily_close_series", new_callable=AsyncMock)
    def test_stale_entries_are_evicted_on_write(self, mock_fetch_daily_close_series):
        start = date.today() - timedelta(days=30)
        end = date.today()
        stale_key = ("STALE", "us_equity", start.isoformat(), end.isoformat())

        price_history_service._history_cache[stale_key] = (
            time.time() - (price_history_service._CACHE_HARD_TTL_SECONDS + 5),
            [(start, 100.0)],
        )
        price_history_service._history_locks[stale_key] = object()

        fresh_series = [(end, 120.0)]
        mock_fetch_daily_close_series.return_value = fresh_series

        result = asyncio.run(
            price_history_service.get_daily_close_series_cached("AAPL", start=start, end=end)
        )

        self.assertEqual(result, fresh_series)
        self.assertNotIn(stale_key, price_history_service._history_cache)
        self.assertNotIn(stale_key, price_history_service._history_locks)

    @patch("app.services.price_history.fetch_daily_close_series", new_callable=AsyncMock)
    def test_cache_overflow_trims_oldest_entries_and_their_locks(self, mock_fetch_daily_close_series):
        original_max_size = price_history_service._CACHE_MAX_SIZE
        original_hard_ttl = price_history_service._CACHE_HARD_TTL_SECONDS
        price_history_service._CACHE_MAX_SIZE = 4
        price_history_service._CACHE_HARD_TTL_SECONDS = 3600

        try:
            base_start = date.today() - timedelta(days=60)
            base_end = date.today()
            now = time.time()

            seeded_keys = []
            for index in range(4):
                symbol = f"SYM{index}"
                key = (
                    symbol,
                    "us_equity",
                    base_start.isoformat(),
                    base_end.isoformat(),
                )
                seeded_keys.append(key)
                price_history_service._history_cache[key] = (
                    now - (100 - index),
                    [(base_end, float(index))],
                )
                price_history_service._history_locks[key] = object()

            mock_fetch_daily_close_series.return_value = [(base_end, 999.0)]

            asyncio.run(
                price_history_service.get_daily_close_series_cached(
                    "NEWSYM",
                    start=base_start,
                    end=base_end,
                )
            )

            self.assertLessEqual(
                len(price_history_service._history_cache),
                price_history_service._CACHE_MAX_SIZE,
            )
            self.assertNotIn(seeded_keys[0], price_history_service._history_cache)
            self.assertNotIn(seeded_keys[0], price_history_service._history_locks)
            self.assertNotIn(seeded_keys[1], price_history_service._history_cache)
            self.assertNotIn(seeded_keys[1], price_history_service._history_locks)
        finally:
            price_history_service._CACHE_MAX_SIZE = original_max_size
            price_history_service._CACHE_HARD_TTL_SECONDS = original_hard_ttl


if __name__ == "__main__":
    unittest.main()
