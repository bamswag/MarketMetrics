from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from app.integrations.alpaca.client import AlpacaMarketDataError
from app.schemas.instruments import InstrumentRange
from app.schemas.quotes import PublicQuoteOut
from app.services.instruments import resolve_history_window

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


def _bar(point_date: date, close: float, *, volume: int = 1_000_000) -> dict:
    return {
        "date": point_date,
        "open": close - 1,
        "high": close + 2,
        "low": close - 2,
        "close": close,
        "volume": volume,
        "trade_count": 500,
        "vwap": close + 0.25,
    }


class InstrumentRouteTests(BaseAPITestCase):
    @patch("app.services.instruments.resolve_company_name")
    @patch("app.services.instruments.get_earliest_available_close_date_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_daily_bar_series_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_quote_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_returns_chart_ready_payload(
        self,
        mock_get_symbol_metadata,
        mock_get_quote_cached,
        mock_get_daily_bar_series_cached,
        mock_get_earliest_available_close_date_cached,
        mock_resolve_company_name,
    ):
        token = self.register_and_login(email="instrument@example.com")
        mock_get_symbol_metadata.return_value = {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "tradable": True,
        }
        mock_resolve_company_name.return_value = "Apple Inc."
        mock_get_earliest_available_close_date_cached.return_value = date(2025, 1, 10)
        mock_get_quote_cached.return_value = {
            "symbol": "AAPL",
            "price": 210.25,
            "change": 2.11,
            "changePercent": "1.01%",
            "open": 208.0,
            "high": 212.0,
            "low": 207.5,
            "close": 210.25,
            "previousClose": 208.14,
            "volume": 55_200_000,
            "vwap": 209.75,
            "tradeCount": 185_000,
            "latestTradingDay": "2026-04-06",
            "source": "alpaca",
        }
        historical_series = [
            _bar(date(2025, 1, 10), 189.4),
            _bar(date(2025, 12, 10), 198.5),
            _bar(date(2026, 2, 2), 201.0),
            _bar(date(2026, 4, 2), 204.0),
            _bar(date(2026, 4, 3), 206.5),
        ]
        mock_get_daily_bar_series_cached.side_effect = (
            lambda *args, **kwargs: [
                row
                for row in historical_series
                if kwargs.get("start") is None or row["date"] >= kwargs["start"]
            ]
        )

        response = self.client.get(
            "/instruments/AAPL?range=6M",
            headers=self.auth_headers(token),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["symbol"], "AAPL")
        self.assertEqual(payload["companyName"], "Apple Inc.")
        self.assertEqual(payload["exchange"], "NASDAQ")
        self.assertEqual(payload["range"], "6M")
        self.assertEqual(payload["availableRanges"], ["1W", "1M", "3M", "6M", "1Y", "MAX"])
        self.assertEqual(payload["earliestAvailableDate"], "2025-01-10")
        self.assertEqual(payload["latestQuote"]["price"], 210.25)
        self.assertEqual(payload["latestQuote"]["high"], 212.0)
        self.assertEqual(payload["latestQuote"]["low"], 207.5)
        self.assertEqual(payload["latestQuote"]["volume"], 55_200_000)
        self.assertEqual(len(payload["historicalSeries"]), 4)
        self.assertEqual(payload["historicalSeries"][0]["open"], 197.5)
        self.assertEqual(payload["historicalSeries"][0]["high"], 200.5)
        self.assertEqual(payload["historicalSeries"][0]["low"], 196.5)
        self.assertEqual(payload["historicalSeries"][0]["volume"], 1_000_000)
        mock_get_daily_bar_series_cached.assert_awaited_once()
        self.assertEqual(
            mock_get_daily_bar_series_cached.await_args.kwargs["start"],
            date.today() - timedelta(days=182),
        )

    @patch("app.services.instruments.resolve_company_name")
    @patch("app.services.instruments.get_earliest_available_close_date_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_daily_bar_series_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_quote_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_supports_max_range_and_disables_unavailable_ranges(
        self,
        mock_get_symbol_metadata,
        mock_get_quote_cached,
        mock_get_daily_bar_series_cached,
        mock_get_earliest_available_close_date_cached,
        mock_resolve_company_name,
    ):
        token = self.register_and_login(email="instrument-max@example.com")
        mock_get_symbol_metadata.return_value = {
            "symbol": "ETH/USD",
            "name": "Ethereum",
            "exchange": "CRYPTO",
            "tradable": True,
            "asset_class": "crypto",
        }
        mock_resolve_company_name.return_value = "Ethereum"
        mock_get_earliest_available_close_date_cached.return_value = date(2025, 8, 20)
        mock_get_quote_cached.return_value = {
            "symbol": "ETH/USD",
            "price": 3210.5,
            "change": -42.1,
            "changePercent": "-1.29%",
            "latestTradingDay": "2026-04-17",
            "source": "alpaca",
        }
        mock_get_daily_bar_series_cached.return_value = [
            _bar(date(2025, 8, 20), 2810.0),
            _bar(date(2025, 11, 20), 2925.0),
            _bar(date(2026, 2, 20), 3055.0),
            _bar(date(2026, 4, 17), 3210.5),
        ]

        response = self.client.get(
            "/instruments/ETH%2FUSD?range=5Y",
            headers=self.auth_headers(token),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["range"], "MAX")
        self.assertEqual(payload["availableRanges"], ["1W", "1M", "3M", "6M", "MAX"])
        self.assertEqual(payload["earliestAvailableDate"], "2025-08-20")
        self.assertEqual(len(payload["historicalSeries"]), 4)

    @patch("app.services.instruments.resolve_company_name")
    @patch("app.services.instruments.get_earliest_available_close_date_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_daily_bar_series_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_quote_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_accepts_direct_max_query_value(
        self,
        mock_get_symbol_metadata,
        mock_get_quote_cached,
        mock_get_daily_bar_series_cached,
        mock_get_earliest_available_close_date_cached,
        mock_resolve_company_name,
    ):
        mock_get_symbol_metadata.return_value = {
            "symbol": "QQQ",
            "name": "Invesco QQQ Trust, Series 1",
            "exchange": "NASDAQ",
            "tradable": True,
            "assetCategory": "etfs",
        }
        mock_resolve_company_name.return_value = "Invesco QQQ Trust, Series 1"
        mock_get_earliest_available_close_date_cached.return_value = date(2021, 1, 4)
        mock_get_quote_cached.return_value = {
            "symbol": "QQQ",
            "price": 507.72,
            "change": 2.18,
            "changePercent": "0.43%",
            "latestTradingDay": "2026-04-16",
            "source": "alpaca",
        }
        mock_get_daily_bar_series_cached.return_value = [
            _bar(date(2021, 1, 4), 313.1),
            _bar(date(2023, 1, 5), 268.4),
            _bar(date(2025, 1, 6), 413.2),
            _bar(date(2026, 4, 16), 507.72),
        ]

        response = self.client.get("/instruments/QQQ?range=MAX")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["range"], "MAX")
        self.assertEqual(payload["availableRanges"], ["1W", "1M", "3M", "6M", "1Y", "5Y", "MAX"])
        self.assertEqual(payload["earliestAvailableDate"], "2021-01-04")

    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_rejects_symbols_outside_supported_catalog(self, mock_get_symbol_metadata):
        token = self.register_and_login(email="unsupported@example.com")
        mock_get_symbol_metadata.return_value = None

        response = self.client.get(
            "/instruments/XYZ123?range=6M",
            headers=self.auth_headers(token),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "That instrument is not available in the supported catalog.",
        )

    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_rejects_non_tradable_catalog_entries(self, mock_get_symbol_metadata):
        token = self.register_and_login(email="non-tradable@example.com")
        mock_get_symbol_metadata.return_value = {
            "symbol": "IVAWF",
            "name": "Investcorp Example",
            "exchange": "OTC",
            "status": "active",
            "tradable": False,
        }

        response = self.client.get(
            "/instruments/IVAWF?range=6M",
            headers=self.auth_headers(token),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "That instrument is not currently available for chart loading.",
        )

    @patch("app.services.instruments.get_earliest_available_close_date_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_daily_bar_series_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_quote_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_returns_400_for_missing_history(
        self,
        mock_get_symbol_metadata,
        mock_get_quote_cached,
        mock_get_daily_bar_series_cached,
        mock_get_earliest_available_close_date_cached,
    ):
        token = self.register_and_login(email="missing-history@example.com")
        mock_get_symbol_metadata.return_value = {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "tradable": True,
        }
        mock_get_earliest_available_close_date_cached.return_value = date(2025, 1, 10)
        mock_get_quote_cached.return_value = {
            "symbol": "AAPL",
            "price": 210.25,
            "change": 2.11,
            "changePercent": "1.01%",
            "latestTradingDay": "2026-04-06",
            "source": "alpaca",
        }
        mock_get_daily_bar_series_cached.side_effect = AlpacaMarketDataError(
            "No historical bar data is available for that symbol."
        )

        response = self.client.get(
            "/instruments/AAPL?range=1Y",
            headers=self.auth_headers(token),
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("No historical bar data", response.json()["detail"])

    @patch("app.services.instruments.resolve_company_name")
    @patch("app.services.instruments.get_earliest_available_close_date_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_daily_bar_series_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_quote_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_is_available_without_authentication(
        self,
        mock_get_symbol_metadata,
        mock_get_quote_cached,
        mock_get_daily_bar_series_cached,
        mock_get_earliest_available_close_date_cached,
        mock_resolve_company_name,
    ):
        mock_get_symbol_metadata.return_value = {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "tradable": True,
        }
        mock_resolve_company_name.return_value = "Apple Inc."
        mock_get_earliest_available_close_date_cached.return_value = date(2025, 1, 10)
        mock_get_quote_cached.return_value = {
            "symbol": "AAPL",
            "price": 210.25,
            "change": 2.11,
            "changePercent": "1.01%",
            "latestTradingDay": "2026-04-06",
            "source": "alpaca",
        }
        mock_get_daily_bar_series_cached.return_value = [
            _bar(date(2025, 1, 10), 189.4),
            _bar(date(2025, 12, 10), 198.5),
            _bar(date(2026, 2, 2), 201.0),
            _bar(date(2026, 4, 2), 204.0),
            _bar(date(2026, 4, 3), 206.5),
        ]

        response = self.client.get("/instruments/AAPL?range=6M")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["symbol"], "AAPL")
        self.assertEqual(payload["companyName"], "Apple Inc.")

    @patch("app.services.instruments.resolve_company_name")
    @patch("app.services.instruments.get_earliest_available_close_date_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_daily_bar_series_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_quote_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_symbol_metadata")
    def test_crypto_instrument_detail_supports_slash_symbol_paths(
        self,
        mock_get_symbol_metadata,
        mock_get_quote_cached,
        mock_get_daily_bar_series_cached,
        mock_get_earliest_available_close_date_cached,
        mock_resolve_company_name,
    ):
        mock_get_symbol_metadata.return_value = {
            "symbol": "BTC/USD",
            "name": "Bitcoin",
            "exchange": "CRYPTO",
            "tradable": True,
            "asset_class": "crypto",
        }
        mock_resolve_company_name.return_value = "Bitcoin"
        mock_get_earliest_available_close_date_cached.return_value = date(2025, 9, 1)
        mock_get_quote_cached.return_value = {
            "symbol": "BTC/USD",
            "price": 84250.0,
            "change": 1320.2,
            "changePercent": "1.59%",
            "latestTradingDay": "2026-04-06",
            "source": "alpaca",
        }
        mock_get_daily_bar_series_cached.return_value = [
            _bar(date(2025, 9, 1), 77000.0),
            _bar(date(2026, 1, 10), 81200.0),
            _bar(date(2026, 3, 20), 82150.0),
            _bar(date(2026, 4, 3), 83425.0),
        ]

        response = self.client.get("/instruments/BTC%2FUSD?range=1M")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["symbol"], "BTC/USD")
        self.assertEqual(payload["companyName"], "Bitcoin")
        self.assertEqual(payload["exchange"], "CRYPTO")
        self.assertEqual(payload["latestQuote"]["price"], 84250.0)

    @patch("app.services.search.get_symbol_metadata")
    @patch("app.services.instruments.get_public_quotes_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.load_symbol_catalog")
    @patch("app.services.instruments.get_symbol_metadata")
    def test_similar_instruments_returns_same_category_public_quotes(
        self,
        mock_get_symbol_metadata,
        mock_load_symbol_catalog,
        mock_get_public_quotes_cached,
        mock_search_get_symbol_metadata,
    ):
        catalog = [
            {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "exchange": "NASDAQ",
                "asset_class": "us_equity",
                "tradable": True,
            },
            {
                "symbol": "MSFT",
                "name": "Microsoft Corporation",
                "exchange": "NASDAQ",
                "asset_class": "us_equity",
                "tradable": True,
            },
            {
                "symbol": "NVDA",
                "name": "NVIDIA Corporation",
                "exchange": "NASDAQ",
                "asset_class": "us_equity",
                "tradable": True,
            },
            {
                "symbol": "SPY",
                "name": "SPDR S&P 500 ETF Trust",
                "exchange": "ARCA",
                "asset_class": "us_equity",
                "tradable": True,
            },
        ]
        metadata_by_symbol = {item["symbol"]: item for item in catalog}
        mock_get_symbol_metadata.side_effect = lambda symbol: metadata_by_symbol.get(symbol)
        mock_search_get_symbol_metadata.side_effect = lambda symbol: metadata_by_symbol.get(symbol)
        mock_load_symbol_catalog.return_value = catalog
        mock_get_public_quotes_cached.return_value = [
            PublicQuoteOut(
                symbol="NVDA",
                price=950.25,
                change=11.5,
                changePercent="1.23%",
                source="alpaca",
            ),
            PublicQuoteOut(
                symbol="MSFT",
                price=420.1,
                change=-1.5,
                changePercent="-0.36%",
                source="alpaca",
            ),
        ]

        response = self.client.get("/instruments/similar/AAPL?limit=2")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        symbols = [item["symbol"] for item in payload["results"]]
        self.assertEqual(payload["symbol"], "AAPL")
        self.assertEqual(payload["assetCategory"], "stocks")
        self.assertEqual(len(symbols), 2)
        self.assertNotIn("AAPL", symbols)
        self.assertNotIn("SPY", symbols)
        self.assertEqual(payload["results"][0]["latestQuote"]["price"], 950.25)
        mock_get_public_quotes_cached.assert_awaited_once()

    @patch("app.services.search.get_symbol_metadata")
    @patch("app.services.instruments.get_public_quotes_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.load_symbol_catalog")
    @patch("app.services.instruments.get_symbol_metadata")
    def test_similar_instruments_keeps_crypto_with_crypto_quote_market(
        self,
        mock_get_symbol_metadata,
        mock_load_symbol_catalog,
        mock_get_public_quotes_cached,
        mock_search_get_symbol_metadata,
    ):
        catalog = [
            {
                "symbol": "BTC/USD",
                "name": "Bitcoin",
                "exchange": "CRYPTO",
                "asset_class": "crypto",
                "tradable": True,
            },
            {
                "symbol": "ETH/USD",
                "name": "Ethereum",
                "exchange": "CRYPTO",
                "asset_class": "crypto",
                "tradable": True,
            },
            {
                "symbol": "SOL/USDT",
                "name": "Solana / Tether",
                "exchange": "CRYPTO",
                "asset_class": "crypto",
                "tradable": True,
            },
            {
                "symbol": "AAPL",
                "name": "Apple Inc.",
                "exchange": "NASDAQ",
                "asset_class": "us_equity",
                "tradable": True,
            },
        ]
        metadata_by_symbol = {item["symbol"]: item for item in catalog}
        mock_get_symbol_metadata.side_effect = lambda symbol: metadata_by_symbol.get(symbol)
        mock_search_get_symbol_metadata.side_effect = lambda symbol: metadata_by_symbol.get(symbol)
        mock_load_symbol_catalog.return_value = catalog
        mock_get_public_quotes_cached.return_value = [
            PublicQuoteOut(symbol="ETH/USD", price=3200.0, changePercent="2.10%"),
            PublicQuoteOut(symbol="SOL/USDT", price=145.0, changePercent="-1.20%"),
        ]

        response = self.client.get("/instruments/similar/BTC%2FUSD?limit=2")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        symbols = [item["symbol"] for item in payload["results"]]
        self.assertEqual(payload["assetCategory"], "crypto")
        self.assertIn("ETH/USD", symbols)
        self.assertIn("SOL/USDT", symbols)
        self.assertNotIn("AAPL", symbols)
        self.assertEqual(payload["results"][0]["similarityReason"], "Same crypto quote market")


class InstrumentServiceTests(BaseAPITestCase):
    def test_range_window_selection_matches_expected_ranges(self):
        six_month_start, six_month_end = resolve_history_window(InstrumentRange.six_months)
        five_year_start, five_year_end = resolve_history_window(InstrumentRange.five_years)
        max_start, max_end = resolve_history_window(InstrumentRange.max_range)

        self.assertEqual((six_month_end - six_month_start).days, 182)
        self.assertEqual((five_year_end - five_year_start).days, 365 * 5)
        self.assertIsNone(max_start)
        self.assertEqual(max_end, six_month_end)
