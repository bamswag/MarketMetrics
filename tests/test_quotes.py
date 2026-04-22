from unittest.mock import AsyncMock, patch

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


class PublicQuotesRouteTests(BaseAPITestCase):
    @patch("app.services.quotes.fetch_snapshots", new_callable=AsyncMock)
    @patch("app.services.quotes.get_symbol_metadata")
    def test_public_quotes_are_available_without_authentication(
        self,
        mock_get_symbol_metadata,
        mock_fetch_snapshots,
    ):
        mock_get_symbol_metadata.side_effect = lambda symbol: {
            "symbol": symbol,
            "name": f"{symbol} Inc.",
            "exchange": "NASDAQ",
            "tradable": True,
        }
        mock_fetch_snapshots.return_value = {
            "AAPL": {
                "price": 210.25,
                "change": 2.11,
                "changePercent": "1.01%",
                "latestTradingDay": "2026-04-21",
                "source": "alpaca",
            }
        }

        response = self.client.get("/quotes/?symbols=AAPL,MSFT,AAPL")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["quotes"]), 2)
        self.assertEqual(payload["quotes"][0]["symbol"], "AAPL")
        self.assertEqual(payload["quotes"][0]["price"], 210.25)
        self.assertEqual(payload["quotes"][1]["symbol"], "MSFT")
        self.assertIsNone(payload["quotes"][1]["price"])
        self.assertEqual(payload["quotes"][1]["unavailableReason"], "No quote data available.")
        mock_fetch_snapshots.assert_awaited_once()

    def test_public_quotes_limit_symbol_count(self):
        symbols = ",".join(f"SYM{i}" for i in range(61))

        response = self.client.get(f"/quotes/?symbols={symbols}")

        self.assertEqual(response.status_code, 400)
        self.assertIn("limited to 60 symbols", response.json()["detail"])
