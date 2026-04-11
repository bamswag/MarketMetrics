from unittest.mock import AsyncMock, patch

from test_auth import BaseAPITestCase


class WatchlistTests(BaseAPITestCase):
    @patch("app.services.watchlists.get_quote_cached", new_callable=AsyncMock)
    def test_watchlist_crud_and_enriched_listing(self, mock_get_quote_cached):
        token = self.register_and_login(email="watchlist@example.com")
        mock_get_quote_cached.return_value = {
            "symbol": "AAPL",
            "price": 187.25,
            "change": 1.12,
            "changePercent": "0.60%",
            "latestTradingDay": "2026-04-03",
            "source": "alpaca",
        }

        create_response = self.client.post(
            "/watchlist/",
            headers=self.auth_headers(token),
            json={"symbol": "AAPL"},
        )
        self.assertEqual(create_response.status_code, 201)

        list_response = self.client.get(
            "/watchlist/",
            headers=self.auth_headers(token),
        )
        self.assertEqual(list_response.status_code, 200)
        payload = list_response.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["symbol"], "AAPL")
        self.assertEqual(payload[0]["latestQuote"]["price"], 187.25)
        self.assertEqual(payload[0]["alerts"]["totalAlerts"], 0)

        delete_response = self.client.delete(
            "/watchlist/AAPL",
            headers=self.auth_headers(token),
        )
        self.assertEqual(delete_response.status_code, 204)
