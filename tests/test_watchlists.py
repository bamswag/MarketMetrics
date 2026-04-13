from unittest.mock import AsyncMock, patch

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


class WatchlistTests(BaseAPITestCase):
    @patch("app.services.watchlists.fetch_snapshots", new_callable=AsyncMock)
    def test_watchlist_crud_and_enriched_listing(self, mock_fetch_snapshots):
        token = self.register_and_login(email="watchlist@example.com")
        mock_fetch_snapshots.return_value = {
            "AAPL": {
                "symbol": "AAPL",
                "price": 187.25,
                "change": 1.12,
                "changePercent": "0.60%",
                "latestTradingDay": "2026-04-03",
                "source": "alpaca",
            }
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
        self.assertEqual(payload[0]["assetCategory"], "stocks")
        self.assertEqual(payload[0]["latestQuote"]["price"], 187.25)
        self.assertEqual(payload[0]["alerts"]["totalAlerts"], 0)

        delete_response = self.client.delete(
            "/watchlist/AAPL",
            headers=self.auth_headers(token),
        )
        self.assertEqual(delete_response.status_code, 204)

    @patch("app.services.watchlists.fetch_snapshots", new_callable=AsyncMock)
    def test_watchlist_supports_crypto_symbols_with_slashes(
        self,
        mock_fetch_snapshots,
    ):
        token = self.register_and_login(email="watchlist-crypto@example.com")
        mock_fetch_snapshots.return_value = {
            "BTC/USD": {
                "symbol": "BTC/USD",
                "price": 84000.0,
                "change": 1250.5,
                "changePercent": "1.51%",
                "latestTradingDay": "2026-04-03",
                "source": "alpaca",
            }
        }

        create_response = self.client.post(
            "/watchlist/",
            headers=self.auth_headers(token),
            json={"symbol": "BTC/USD"},
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(create_response.json()["symbol"], "BTC/USD")

        list_response = self.client.get(
            "/watchlist/",
            headers=self.auth_headers(token),
        )
        self.assertEqual(list_response.status_code, 200)
        payload = list_response.json()
        self.assertEqual(payload[0]["symbol"], "BTC/USD")
        self.assertEqual(payload[0]["assetCategory"], "crypto")
        self.assertEqual(payload[0]["latestQuote"]["price"], 84000.0)

        delete_response = self.client.delete(
            "/watchlist/BTC%2FUSD",
            headers=self.auth_headers(token),
        )
        self.assertEqual(delete_response.status_code, 204)
