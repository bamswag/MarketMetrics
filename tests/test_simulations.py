from datetime import date
from unittest.mock import AsyncMock, patch

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


class SimulationAndHistoryTests(BaseAPITestCase):
    @patch("app.services.simulations.fetch_company_name", new_callable=AsyncMock)
    @patch("app.services.simulations.fetch_daily_close_series", new_callable=AsyncMock)
    def test_simulation_persists_history_and_returns_comparison_data(
        self,
        mock_fetch_series,
        mock_fetch_company_name,
    ):
        token = self.register_and_login()
        mock_fetch_company_name.return_value = "Apple Inc."
        mock_fetch_series.return_value = [
            (date(2024, 1, 2), 100.0),
            (date(2024, 2, 1), 110.0),
            (date(2024, 3, 1), 120.0),
            (date(2024, 4, 1), 130.0),
        ]

        response = self.client.post(
            "/simulate/",
            headers=self.auth_headers(token),
            json={
                "assetSymbol": "AAPL",
                "initialAmount": 1000,
                "strategy": "dollar_cost_averaging",
                "recurringContribution": 200,
                "contributionFrequency": "monthly",
                "startDate": "2024-01-02",
                "endDate": "2024-04-01",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["selectedStrategy"], "dollar_cost_averaging")
        self.assertEqual(len(payload["comparison"]), 2)
        self.assertIn("comparisonSummary", payload)
        self.assertGreater(len(payload["chartData"]), 0)
        self.assertIn("contributionOccurred", payload["chartData"][1])
        self.assertIn("annualizedReturnPct", payload)
        self.assertIn("volatilityPct", payload)

        history_response = self.client.get(
            "/simulate/history",
            headers=self.auth_headers(token),
        )
        self.assertEqual(history_response.status_code, 200)
        history = history_response.json()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["strategy"], "dollar_cost_averaging")
        self.assertEqual(history[0]["recurringContribution"], 200.0)
        self.assertEqual(history[0]["contributionFrequency"], "monthly")
        self.assertIn("investedAmount", history[0])
