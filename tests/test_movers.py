import asyncio
from datetime import date
from unittest.mock import AsyncMock, patch

from app.integrations.alpaca.market_data import fetch_snapshots
from app.services.market_overview import get_market_movers

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


class MoversRouteTests(BaseAPITestCase):
    @patch("app.api.routes.movers.get_market_movers", new_callable=AsyncMock)
    def test_movers_route_is_available_without_authentication(self, mock_get_market_movers):
        mock_get_market_movers.return_value = {
            "gainers": [
                {
                    "symbol": "NVDA",
                    "name": "NVIDIA Corporation",
                    "price": 912.33,
                    "change_amount": 24.19,
                    "change_percent": "2.72%",
                    "volume": 1_245_333,
                    "sparklineSeries": [
                        {"date": "2026-04-01", "close": 882.11},
                        {"date": "2026-04-02", "close": 890.45},
                    ],
                }
            ]
            * 3,
            "losers": [
                {
                    "symbol": "INTC",
                    "name": "Intel Corporation",
                    "price": 31.11,
                    "change_amount": -1.4,
                    "change_percent": "-4.31%",
                    "volume": 998_112,
                    "sparklineSeries": [
                        {"date": "2026-04-01", "close": 33.5},
                        {"date": "2026-04-02", "close": 32.8},
                    ],
                }
            ]
            * 3,
            "source": "alpaca",
        }

        response = self.client.get("/movers/?limit=3")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["gainers"]), 3)
        self.assertEqual(len(payload["losers"]), 3)
        self.assertIn("sparklineSeries", payload["gainers"][0])
        mock_get_market_movers.assert_awaited_once_with(3)


class MoversServiceTests(BaseAPITestCase):
    @patch("app.services.market_overview.get_daily_close_series_cached", new_callable=AsyncMock)
    @patch("app.services.market_overview.fetch_top_movers", new_callable=AsyncMock)
    def test_market_movers_include_top_and_bottom_three_with_sparklines(
        self,
        mock_fetch_top_movers,
        mock_get_daily_close_series_cached,
    ):
        mock_fetch_top_movers.return_value = {
            "top_gainers": [
                {"symbol": "NVDA", "price": 912.33, "change_amount": 24.19, "change_percent": "2.72%", "volume": 1_245_333},
                {"symbol": "META", "price": 511.2, "change_amount": 8.1, "change_percent": "1.61%", "volume": 845_232},
                {"symbol": "MSFT", "price": 424.12, "change_amount": 4.02, "change_percent": "0.96%", "volume": 774_018},
            ],
            "top_losers": [
                {"symbol": "INTC", "price": 31.11, "change_amount": -1.4, "change_percent": "-4.31%", "volume": 998_112},
                {"symbol": "BAC", "price": 37.54, "change_amount": -0.91, "change_percent": "-2.37%", "volume": 563_005},
                {"symbol": "DIS", "price": 104.42, "change_amount": -1.88, "change_percent": "-1.77%", "volume": 402_194},
            ],
        }

        async def history_side_effect(symbol, start=None, end=None):
            return [
                (date(2026, 3, 28), 100.0),
                (date(2026, 3, 31), 102.0),
                (date(2026, 4, 1), 101.0),
                (date(2026, 4, 2), 103.0),
                (date(2026, 4, 3), 104.0),
                (date(2026, 4, 4), 105.0),
            ]

        mock_get_daily_close_series_cached.side_effect = history_side_effect

        payload = asyncio.run(get_market_movers(limit=3))

        self.assertEqual(len(payload.gainers), 3)
        self.assertEqual(len(payload.losers), 3)
        self.assertEqual(len(payload.gainers[0].sparklineSeries), 5)
        self.assertEqual(payload.gainers[0].sparklineSeries[0].date.isoformat(), "2026-03-31")
        self.assertEqual(payload.source, "alpaca")
        mock_fetch_top_movers.assert_awaited_once()
        awaited_args = mock_fetch_top_movers.await_args
        self.assertEqual(awaited_args.kwargs["top_n"], 3)
        self.assertIn("asset_class_map", awaited_args.kwargs)
        self.assertEqual(awaited_args.kwargs["asset_class_map"].get("BTC/USD"), "crypto")

    @patch("app.services.market_overview.get_daily_close_series_cached", new_callable=AsyncMock)
    @patch("app.services.market_overview.fetch_top_movers", new_callable=AsyncMock)
    def test_missing_sparkline_history_does_not_fail_the_whole_movers_response(
        self,
        mock_fetch_top_movers,
        mock_get_daily_close_series_cached,
    ):
        mock_fetch_top_movers.return_value = {
            "top_gainers": [
                {"symbol": "NVDA", "price": 912.33, "change_amount": 24.19, "change_percent": "2.72%", "volume": 1_245_333},
                {"symbol": "META", "price": 511.2, "change_amount": 8.1, "change_percent": "1.61%", "volume": 845_232},
                {"symbol": "MSFT", "price": 424.12, "change_amount": 4.02, "change_percent": "0.96%", "volume": 774_018},
            ],
            "top_losers": [
                {"symbol": "INTC", "price": 31.11, "change_amount": -1.4, "change_percent": "-4.31%", "volume": 998_112},
                {"symbol": "BAC", "price": 37.54, "change_amount": -0.91, "change_percent": "-2.37%", "volume": 563_005},
                {"symbol": "DIS", "price": 104.42, "change_amount": -1.88, "change_percent": "-1.77%", "volume": 402_194},
            ],
        }

        async def history_side_effect(symbol, start=None, end=None):
            if symbol == "BAC":
                raise RuntimeError("history unavailable")
            return [
                (date(2026, 4, 1), 100.0),
                (date(2026, 4, 2), 101.0),
                (date(2026, 4, 3), 102.0),
                (date(2026, 4, 4), 103.0),
                (date(2026, 4, 5), 104.0),
            ]

        mock_get_daily_close_series_cached.side_effect = history_side_effect

        payload = asyncio.run(get_market_movers(limit=3))

        self.assertEqual(len(payload.losers), 3)
        bac = next((item for item in payload.losers if item.symbol == "BAC"), None)
        self.assertIsNotNone(bac)
        self.assertEqual(bac.sparklineSeries, [])


class AlpacaBatchSnapshotFallbackTests(BaseAPITestCase):
    @patch("app.integrations.alpaca.market_data.fetch_snapshot", new_callable=AsyncMock)
    @patch("app.integrations.alpaca.market_data._request_json", new_callable=AsyncMock)
    def test_fetch_snapshots_falls_back_to_individual_calls_when_batch_response_is_empty(
        self,
        mock_request_json,
        mock_fetch_snapshot,
    ):
        mock_request_json.return_value = {"snapshots": {}}
        mock_fetch_snapshot.side_effect = [
            {
                "symbol": "NVDA",
                "price": 912.33,
                "change": 24.19,
                "changePercent": "2.72%",
                "volume": 1_245_333,
                "latestTradingDay": "2026-04-09",
                "source": "alpaca",
            },
            {
                "symbol": "META",
                "price": 511.2,
                "change": 8.1,
                "changePercent": "1.61%",
                "volume": 845_232,
                "latestTradingDay": "2026-04-09",
                "source": "alpaca",
            },
        ]

        payload = asyncio.run(fetch_snapshots(["NVDA", "META"]))

        self.assertEqual(set(payload.keys()), {"NVDA", "META"})
        self.assertEqual(payload["NVDA"]["changePercent"], "2.72%")
        self.assertEqual(mock_fetch_snapshot.await_count, 2)
