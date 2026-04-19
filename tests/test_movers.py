import asyncio
from datetime import date
from unittest.mock import AsyncMock, patch

from app.integrations.alpaca.market_data import fetch_snapshots, fetch_top_movers
from app.schemas.movers import (
    FeaturedMoverAsset,
    FeaturedMoverDirection,
    FeaturedMoverPeriod,
)
from app.services.market_overview import get_featured_mover, get_market_movers

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


class MoversRouteTests(BaseAPITestCase):
    @patch("app.api.routes.movers.get_featured_mover", new_callable=AsyncMock)
    def test_featured_mover_route_is_available_without_authentication(
        self,
        mock_get_featured_mover,
    ):
        mock_get_featured_mover.return_value = {
            "period": "week",
            "direction": "gainer",
            "asset": "all",
            "title": "Top gainer this week",
            "mover": {
                "symbol": "NVDA",
                "name": "NVIDIA Corporation",
                "price": 912.33,
                "change_amount": 24.19,
                "change_percent": "2.72%",
                "volume": 1_245_333,
                "sparklineSeries": [],
            },
            "historicalSeries": [
                {"date": "2026-04-01T00:00:00", "close": 882.11},
                {"date": "2026-04-02T00:00:00", "close": 890.45},
            ],
            "source": "alpaca",
        }

        response = self.client.get("/movers/featured?period=week&direction=gainer&asset=all")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["title"], "Top gainer this week")
        self.assertEqual(payload["mover"]["symbol"], "NVDA")
        mock_get_featured_mover.assert_awaited_once_with(
            period=FeaturedMoverPeriod.week,
            direction=FeaturedMoverDirection.gainer,
            asset=FeaturedMoverAsset.all,
        )

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
            "gainersByCategory": {
                "stocks": [
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
                "crypto": [
                    {
                        "symbol": "BTC/USD",
                        "name": "Bitcoin",
                        "price": 74500.0,
                        "change_amount": 1800.0,
                        "change_percent": "2.48%",
                        "volume": 123_000,
                        "sparklineSeries": [
                            {"date": "2026-04-01", "close": 72000.0},
                            {"date": "2026-04-02", "close": 73350.0},
                        ],
                    }
                ]
                * 3,
                "etfs": [
                    {
                        "symbol": "QQQ",
                        "name": "Invesco QQQ Trust, Series 1",
                        "price": 502.11,
                        "change_amount": 6.12,
                        "change_percent": "1.23%",
                        "volume": 812_111,
                        "sparklineSeries": [
                            {"date": "2026-04-01", "close": 491.11},
                            {"date": "2026-04-02", "close": 495.45},
                        ],
                    }
                ]
                * 3,
            },
            "losersByCategory": {
                "stocks": [
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
                "crypto": [
                    {
                        "symbol": "ETH/USD",
                        "name": "Ethereum",
                        "price": 3500.0,
                        "change_amount": -70.0,
                        "change_percent": "-1.96%",
                        "volume": 98_200,
                        "sparklineSeries": [
                            {"date": "2026-04-01", "close": 3620.0},
                            {"date": "2026-04-02", "close": 3585.0},
                        ],
                    }
                ]
                * 3,
                "etfs": [
                    {
                        "symbol": "IWM",
                        "name": "iShares Russell 2000 ETF",
                        "price": 214.22,
                        "change_amount": -2.05,
                        "change_percent": "-0.95%",
                        "volume": 566_123,
                        "sparklineSeries": [
                            {"date": "2026-04-01", "close": 218.22},
                            {"date": "2026-04-02", "close": 217.11},
                        ],
                    }
                ]
                * 3,
            },
            "source": "alpaca",
        }

        response = self.client.get("/movers/?limit=3")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["gainers"]), 3)
        self.assertEqual(len(payload["losers"]), 3)
        self.assertEqual(len(payload["gainersByCategory"]["crypto"]), 3)
        self.assertEqual(len(payload["losersByCategory"]["etfs"]), 3)
        self.assertIn("sparklineSeries", payload["gainers"][0])
        mock_get_market_movers.assert_awaited_once_with(3)

    @patch("app.api.routes.movers.get_market_movers", new_callable=AsyncMock)
    def test_movers_route_accepts_higher_limit_for_load_more(self, mock_get_market_movers):
        mock_get_market_movers.return_value = {
            "gainers": [],
            "losers": [],
            "gainersByCategory": {"stocks": [], "crypto": [], "etfs": []},
            "losersByCategory": {"stocks": [], "crypto": [], "etfs": []},
            "source": "alpaca",
        }

        response = self.client.get("/movers/?limit=20")

        self.assertEqual(response.status_code, 200)
        mock_get_market_movers.assert_awaited_once_with(20)


class MoversServiceTests(BaseAPITestCase):
    @patch("app.services.market_overview.get_daily_close_series_cached", new_callable=AsyncMock)
    @patch("app.services.market_overview.fetch_top_movers", new_callable=AsyncMock)
    def test_market_movers_include_top_and_bottom_three_with_sparklines(
        self,
        mock_fetch_top_movers,
        mock_get_daily_close_series_cached,
    ):
        mock_fetch_top_movers.side_effect = [
            {
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
            },
            {
                "top_gainers": [
                    {"symbol": "BTC/USD", "price": 74250.0, "change_amount": 3621.2, "change_percent": "5.13%", "volume": 90_000},
                    {"symbol": "ETH/USD", "price": 3560.0, "change_amount": 88.6, "change_percent": "2.55%", "volume": 82_500},
                    {"symbol": "PAXG/USD", "price": 3445.2, "change_amount": 47.58, "change_percent": "1.40%", "volume": 76_000},
                ],
                "top_losers": [
                    {"symbol": "DOGE/USD", "price": 0.18, "change_amount": -0.02, "change_percent": "-8.21%", "volume": 115_000},
                    {"symbol": "SOL/USD", "price": 168.4, "change_amount": -5.1, "change_percent": "-2.94%", "volume": 77_100},
                    {"symbol": "ETH/USD", "price": 3420.0, "change_amount": -69.3, "change_percent": "-1.99%", "volume": 83_000},
                ],
            },
            {
                "top_gainers": [
                    {"symbol": "QQQ", "price": 502.11, "change_amount": 9.64, "change_percent": "1.96%", "volume": 812_111},
                    {"symbol": "SPY", "price": 524.21, "change_amount": 7.11, "change_percent": "1.37%", "volume": 930_552},
                    {"symbol": "DIA", "price": 410.02, "change_amount": 3.43, "change_percent": "0.84%", "volume": 401_221},
                ],
                "top_losers": [
                    {"symbol": "IWM", "price": 214.22, "change_amount": -2.05, "change_percent": "-0.95%", "volume": 566_123},
                    {"symbol": "SPY", "price": 519.44, "change_amount": -1.44, "change_percent": "-0.28%", "volume": 902_000},
                    {"symbol": "QQQ", "price": 498.72, "change_amount": -0.88, "change_percent": "-0.18%", "volume": 799_888},
                ],
            },
        ]

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
        self.assertEqual([item.symbol for item in payload.gainers], ["BTC/USD", "NVDA", "ETH/USD"])
        self.assertEqual([item.symbol for item in payload.losers], ["DOGE/USD", "INTC", "SOL/USD"])
        self.assertEqual(
            [item.symbol for item in payload.gainersByCategory.stocks],
            ["NVDA", "META", "MSFT"],
        )
        self.assertEqual(
            [item.symbol for item in payload.gainersByCategory.crypto],
            ["BTC/USD", "ETH/USD", "PAXG/USD"],
        )
        self.assertEqual(payload.gainersByCategory.crypto[2].name, "PAX Gold / US Dollar")
        self.assertEqual(
            [item.symbol for item in payload.gainersByCategory.etfs],
            ["QQQ", "SPY", "DIA"],
        )
        self.assertEqual(len(payload.gainers[0].sparklineSeries), 5)
        self.assertEqual(payload.gainers[0].sparklineSeries[0].date.isoformat(), "2026-03-31")
        self.assertEqual(payload.source, "alpaca")
        self.assertEqual(mock_fetch_top_movers.await_count, 3)
        awaited_args = mock_fetch_top_movers.await_args_list[0]
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
        mock_fetch_top_movers.side_effect = [
            {
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
            },
            {
                "top_gainers": [],
                "top_losers": [],
            },
            {
                "top_gainers": [],
                "top_losers": [],
            },
        ]

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

    @patch("app.services.market_overview.fetch_intraday_close_series", new_callable=AsyncMock)
    @patch("app.services.market_overview.fetch_top_movers", new_callable=AsyncMock)
    @patch("app.services.market_overview.get_dynamic_mover_universe_symbols_by_category", new_callable=AsyncMock)
    def test_featured_day_mover_uses_selected_direction_asset_and_intraday_series(
        self,
        mock_get_dynamic_mover_universe_symbols_by_category,
        mock_fetch_top_movers,
        mock_fetch_intraday_close_series,
    ):
        mock_get_dynamic_mover_universe_symbols_by_category.return_value = {
            "stocks": ["NVDA", "AAPL"],
            "crypto": ["BTC/USD"],
            "etfs": ["QQQ"],
        }
        mock_fetch_top_movers.return_value = {
            "top_gainers": [
                {
                    "symbol": "QQQ",
                    "price": 502.11,
                    "change_amount": 9.64,
                    "change_percent": "1.96%",
                    "volume": 812_111,
                }
            ],
            "top_losers": [],
        }
        mock_fetch_intraday_close_series.return_value = [
            (date(2026, 4, 16), 491.11),
            (date(2026, 4, 17), 502.11),
        ]

        payload = asyncio.run(
            get_featured_mover(
                period=FeaturedMoverPeriod.day,
                direction=FeaturedMoverDirection.gainer,
                asset=FeaturedMoverAsset.etfs,
            )
        )

        self.assertEqual(payload.title, "Top ETF gainer today")
        self.assertIsNotNone(payload.mover)
        self.assertEqual(payload.mover.symbol, "QQQ")
        self.assertEqual(len(payload.historicalSeries), 2)
        mock_fetch_top_movers.assert_awaited_once()
        awaited_kwargs = mock_fetch_top_movers.await_args.kwargs
        self.assertEqual(awaited_kwargs["top_n"], 1)
        self.assertEqual(awaited_kwargs["asset_class_map"]["QQQ"], "us_equity")
        mock_fetch_intraday_close_series.assert_awaited_once_with("QQQ", asset_class="us_equity")

    @patch("app.services.market_overview.get_daily_close_series_cached", new_callable=AsyncMock)
    @patch("app.services.market_overview.fetch_snapshots", new_callable=AsyncMock)
    @patch("app.services.market_overview.get_dynamic_mover_universe_symbols_by_category", new_callable=AsyncMock)
    def test_featured_month_loser_picks_worst_performer_for_asset_scope(
        self,
        mock_get_dynamic_mover_universe_symbols_by_category,
        mock_fetch_snapshots,
        mock_get_daily_close_series_cached,
    ):
        mock_get_dynamic_mover_universe_symbols_by_category.return_value = {
            "stocks": ["NFLX", "AAPL", "AMD"],
            "crypto": ["BTC/USD"],
            "etfs": ["QQQ"],
        }
        mock_fetch_snapshots.return_value = {
            "NFLX": {"price": 92.0, "volume": 101},
            "AAPL": {"price": 97.0, "volume": 102},
            "AMD": {"price": 99.0, "volume": 103},
        }

        async def history_side_effect(symbol, start=None, end=None):
            mapping = {
                "NFLX": [(date(2026, 3, 19), 100.0), (date(2026, 4, 17), 92.0)],
                "AAPL": [(date(2026, 3, 19), 100.0), (date(2026, 4, 17), 97.0)],
                "AMD": [(date(2026, 3, 19), 100.0), (date(2026, 4, 17), 99.0)],
            }
            return mapping[symbol]

        mock_get_daily_close_series_cached.side_effect = history_side_effect

        payload = asyncio.run(
            get_featured_mover(
                period=FeaturedMoverPeriod.month,
                direction=FeaturedMoverDirection.loser,
                asset=FeaturedMoverAsset.stocks,
            )
        )

        self.assertEqual(payload.title, "Top stock loser this month")
        self.assertIsNotNone(payload.mover)
        self.assertEqual(payload.mover.symbol, "NFLX")
        self.assertEqual(payload.mover.change_percent, "-8.00%")
        self.assertEqual(len(payload.historicalSeries), 2)

    @patch("app.services.market_overview.fetch_top_movers", new_callable=AsyncMock)
    @patch("app.services.market_overview.get_dynamic_mover_universe_symbols_by_category", new_callable=AsyncMock)
    def test_featured_mover_returns_empty_payload_when_no_candidate_exists(
        self,
        mock_get_dynamic_mover_universe_symbols_by_category,
        mock_fetch_top_movers,
    ):
        mock_get_dynamic_mover_universe_symbols_by_category.return_value = {
            "stocks": [],
            "crypto": [],
            "etfs": [],
        }
        mock_fetch_top_movers.return_value = {"top_gainers": [], "top_losers": []}

        payload = asyncio.run(
            get_featured_mover(
                period=FeaturedMoverPeriod.day,
                direction=FeaturedMoverDirection.loser,
                asset=FeaturedMoverAsset.crypto,
            )
        )

        self.assertEqual(payload.title, "Top crypto loser today")
        self.assertIsNone(payload.mover)
        self.assertEqual(payload.historicalSeries, [])


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

    @patch("app.integrations.alpaca.market_data.fetch_snapshot", new_callable=AsyncMock)
    @patch("app.integrations.alpaca.market_data._request_json", new_callable=AsyncMock)
    def test_fetch_snapshots_batches_crypto_symbols_before_falling_back(
        self,
        mock_request_json,
        mock_fetch_snapshot,
    ):
        mock_request_json.return_value = {
            "snapshots": {
                "BTC/USD": {
                    "latestTrade": {"p": 74500.0},
                    "dailyBar": {"v": 123_000, "t": "2026-04-16T00:00:00Z"},
                    "prevDailyBar": {"c": 74368.39, "t": "2026-04-15T00:00:00Z"},
                },
                "ETH/USD": {
                    "latestTrade": {"p": 2340.0},
                    "dailyBar": {"v": 98_200, "t": "2026-04-16T00:00:00Z"},
                    "prevDailyBar": {"c": 2356.68, "t": "2026-04-15T00:00:00Z"},
                },
            }
        }

        payload = asyncio.run(
            fetch_snapshots(
                ["BTC/USD", "ETH/USD"],
                asset_class_map={"BTC/USD": "crypto", "ETH/USD": "crypto"},
            )
        )

        self.assertEqual(set(payload.keys()), {"BTC/USD", "ETH/USD"})
        self.assertEqual(payload["BTC/USD"]["symbol"], "BTC/USD")
        self.assertEqual(payload["ETH/USD"]["symbol"], "ETH/USD")
        mock_request_json.assert_awaited_once()
        mock_fetch_snapshot.assert_not_awaited()


class AlpacaTopMoversRankingTests(BaseAPITestCase):
    @patch("app.integrations.alpaca.market_data.fetch_snapshots", new_callable=AsyncMock)
    def test_fetch_top_movers_only_returns_negative_entries_for_losers_and_sorts_them(
        self,
        mock_fetch_snapshots,
    ):
        mock_fetch_snapshots.return_value = {
            "BTC/USD": {
                "price": 74500.0,
                "change": 131.61,
                "changePercent": "0.18%",
                "volume": 123_000,
            },
            "ETH/USD": {
                "price": 2340.0,
                "change": -16.68,
                "changePercent": "-0.71%",
                "volume": 98_200,
            },
            "AVAX/USD": {
                "price": 9.72,
                "change": 0.31,
                "changePercent": "3.30%",
                "volume": 66_100,
            },
            "DOGE/USD": {
                "price": 0.15,
                "change": -0.02,
                "changePercent": "-12.50%",
                "volume": 88_400,
            },
            "SOL/USD": {
                "price": 142.5,
                "change": -4.2,
                "changePercent": "-2.94%",
                "volume": 77_100,
            },
        }

        payload = asyncio.run(
            fetch_top_movers(
                ["BTC/USD", "ETH/USD", "AVAX/USD", "DOGE/USD", "SOL/USD"],
                top_n=3,
                asset_class_map={
                    "BTC/USD": "crypto",
                    "ETH/USD": "crypto",
                    "AVAX/USD": "crypto",
                    "DOGE/USD": "crypto",
                    "SOL/USD": "crypto",
                },
            )
        )

        self.assertEqual(
            [item["symbol"] for item in payload["top_gainers"]],
            ["AVAX/USD", "BTC/USD"],
        )
        self.assertEqual(
            [item["symbol"] for item in payload["top_losers"]],
            ["DOGE/USD", "SOL/USD", "ETH/USD"],
        )
        self.assertTrue(
            all(item["change_amount"] < 0 for item in payload["top_losers"])
        )
        self.assertTrue(
            all(item["change_percent"].startswith("-") for item in payload["top_losers"])
        )
