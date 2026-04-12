from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from starlette.websockets import WebSocketDisconnect

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


class WebSocketTests(BaseAPITestCase):
    def test_websocket_rejects_unauthorized_clients(self):
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/ws/quotes/AAPL"):
                pass

    @patch("app.api.routes.websocket_quotes.evaluate_alerts_for_quote")
    @patch("app.api.routes.websocket_quotes.get_quote_cached", new_callable=AsyncMock)
    def test_websocket_streams_quotes_for_authorized_clients(
        self,
        mock_get_quote_cached,
        mock_evaluate_alerts,
    ):
        token = self.register_and_login()
        mock_get_quote_cached.return_value = {
            "symbol": "AAPL",
            "price": 123.45,
            "change": 1.23,
            "changePercent": "1.01%",
            "volume": 1000,
            "latestTradingDay": "2024-04-01",
            "source": "alpaca",
        }
        mock_evaluate_alerts.return_value = [
            SimpleNamespace(
                id="alert-1",
                symbol="AAPL",
                condition="above",
                targetPrice=120.0,
                triggeredAt=datetime(2024, 4, 1, 12, 0, 0),
            )
        ]

        with self.client.websocket_connect(f"/ws/quotes/AAPL?token={token}") as websocket:
            first_message = websocket.receive_json()
            second_message = websocket.receive_json()

        self.assertEqual(first_message["type"], "quote")
        self.assertEqual(first_message["data"]["symbol"], "AAPL")
        self.assertEqual(second_message["type"], "alert_triggered")
        self.assertEqual(second_message["data"]["symbol"], "AAPL")
