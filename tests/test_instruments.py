from datetime import date
from unittest.mock import AsyncMock, patch

from app.integrations.alpaca.client import AlpacaMarketDataError
from app.schemas.instruments import InstrumentRange
from app.services.instruments import resolve_history_window

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


class InstrumentRouteTests(BaseAPITestCase):
    @patch("app.services.instruments.resolve_company_name")
    @patch("app.services.instruments.get_daily_close_series_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_quote_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_returns_chart_ready_payload(
        self,
        mock_get_symbol_metadata,
        mock_get_quote_cached,
        mock_get_daily_close_series_cached,
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
        mock_get_quote_cached.return_value = {
            "symbol": "AAPL",
            "price": 210.25,
            "change": 2.11,
            "changePercent": "1.01%",
            "latestTradingDay": "2026-04-06",
            "source": "alpaca",
        }
        mock_get_daily_close_series_cached.return_value = [
            (date(2026, 4, 1), 201.0),
            (date(2026, 4, 2), 204.0),
            (date(2026, 4, 3), 206.5),
        ]

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
        self.assertEqual(payload["latestQuote"]["price"], 210.25)
        self.assertEqual(len(payload["historicalSeries"]), 3)

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

    @patch("app.services.instruments.get_daily_close_series_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_quote_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_returns_400_for_missing_history(
        self,
        mock_get_symbol_metadata,
        mock_get_quote_cached,
        mock_get_daily_close_series_cached,
    ):
        token = self.register_and_login(email="missing-history@example.com")
        mock_get_symbol_metadata.return_value = {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "tradable": True,
        }
        mock_get_quote_cached.return_value = {
            "symbol": "AAPL",
            "price": 210.25,
            "change": 2.11,
            "changePercent": "1.01%",
            "latestTradingDay": "2026-04-06",
            "source": "alpaca",
        }
        mock_get_daily_close_series_cached.side_effect = AlpacaMarketDataError(
            "No historical bar data is available for that symbol."
        )

        response = self.client.get(
            "/instruments/AAPL?range=1Y",
            headers=self.auth_headers(token),
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("No historical bar data", response.json()["detail"])

    @patch("app.services.instruments.resolve_company_name")
    @patch("app.services.instruments.get_daily_close_series_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_quote_cached", new_callable=AsyncMock)
    @patch("app.services.instruments.get_symbol_metadata")
    def test_instrument_detail_is_available_without_authentication(
        self,
        mock_get_symbol_metadata,
        mock_get_quote_cached,
        mock_get_daily_close_series_cached,
        mock_resolve_company_name,
    ):
        mock_get_symbol_metadata.return_value = {
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "exchange": "NASDAQ",
            "tradable": True,
        }
        mock_resolve_company_name.return_value = "Apple Inc."
        mock_get_quote_cached.return_value = {
            "symbol": "AAPL",
            "price": 210.25,
            "change": 2.11,
            "changePercent": "1.01%",
            "latestTradingDay": "2026-04-06",
            "source": "alpaca",
        }
        mock_get_daily_close_series_cached.return_value = [
            (date(2026, 4, 1), 201.0),
            (date(2026, 4, 2), 204.0),
            (date(2026, 4, 3), 206.5),
        ]

        response = self.client.get("/instruments/AAPL?range=6M")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["symbol"], "AAPL")
        self.assertEqual(payload["companyName"], "Apple Inc.")


class InstrumentServiceTests(BaseAPITestCase):
    def test_range_window_selection_matches_expected_ranges(self):
        six_month_start, six_month_end = resolve_history_window(InstrumentRange.six_months)
        five_year_start, five_year_end = resolve_history_window(InstrumentRange.five_years)

        self.assertEqual((six_month_end - six_month_start).days, 182)
        self.assertEqual((five_year_end - five_year_start).days, 365 * 5)
