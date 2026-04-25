import unittest
from datetime import date
from unittest.mock import AsyncMock, patch

from app.integrations.alpaca.client import AlpacaMarketDataError
from app.projections.assumptions import (
    build_projection_month_end_dates,
    derive_historical_projection_assumptions,
    resample_to_month_end_closes,
)
from app.projections.engine import build_deterministic_projection_path
from app.projections.monte_carlo import run_monte_carlo_projection
try:
    from test_auth import BaseAPITestCase, _generate_synthetic_rows
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase, _generate_synthetic_rows


class LongTermProjectionServiceTests(unittest.TestCase):
    def test_resample_and_historical_defaults_are_derived_from_monthly_data(self):
        rows = _generate_synthetic_rows(date(2014, 1, 2), 3200, 100.0, 0.0008)

        monthly_closes = resample_to_month_end_closes(rows)
        assumptions = derive_historical_projection_assumptions(rows)

        self.assertGreaterEqual(len(monthly_closes), 36)
        self.assertIn("expectedAnnualReturn", assumptions)
        self.assertIn("annualVolatility", assumptions)
        self.assertGreater(assumptions["historyWindowYearsUsed"], 3)

    def test_deterministic_projection_applies_monthly_contributions(self):
        projection_dates = build_projection_month_end_dates(date(2026, 1, 15), 12)
        result = build_deterministic_projection_path(
            initial_amount=1000.0,
            projection_dates=projection_dates,
            annual_return=0.0,
            recurring_contribution=100.0,
            contribution_frequency="monthly",
        )

        self.assertEqual(len(result["monthlyValues"]), 12)
        self.assertAlmostEqual(result["projectedEndValue"], 2200.0, places=4)
        self.assertAlmostEqual(result["projectedContributionTotal"], 1200.0, places=4)

    def test_monte_carlo_projection_returns_sorted_percentile_bands(self):
        result = run_monte_carlo_projection(
            initial_amount=1000.0,
            projection_months=24,
            annual_return=0.08,
            annual_volatility=0.15,
            recurring_contribution=50.0,
            contribution_frequency="monthly",
            simulation_runs=250,
        )

        self.assertEqual(len(result["p10Series"]), 24)
        self.assertEqual(len(result["p50Series"]), 24)
        self.assertEqual(len(result["p90Series"]), 24)
        self.assertLessEqual(result["p10EndValue"], result["p50EndValue"])
        self.assertLessEqual(result["p50EndValue"], result["p90EndValue"])
        self.assertGreaterEqual(result["probabilityOfProfit"], 0.0)
        self.assertLessEqual(result["probabilityOfProfit"], 1.0)


class LongTermProjectionApiTests(BaseAPITestCase):
    @staticmethod
    def _projection_rows(symbol: str):
        base = {
            "MSFT": (220.0, 0.0009),
            "AAPL": (150.0, 0.0011),
        }
        start_price, slope = base.get(symbol, (180.0, 0.0008))
        return _generate_synthetic_rows(date(2013, 1, 2), 3400, start_price, slope)

    @patch("app.projections.engine.fetch_company_name")
    @patch("app.projections.engine.fetch_daily_bar_rows", new_callable=AsyncMock)
    def test_long_term_projection_returns_monthly_projection_payload(
        self,
        mock_fetch_daily_bar_rows,
        mock_fetch_company_name,
    ):
        token = self.register_and_login(email="project@example.com")
        mock_fetch_company_name.return_value = "Microsoft Corporation"

        async def side_effect(symbol, start=None, end=None, asset_class=None):
            return self._projection_rows(symbol)

        mock_fetch_daily_bar_rows.side_effect = side_effect

        response = self.client.post(
            "/project/long-term",
            headers=self.auth_headers(token),
            json={
                "symbol": "MSFT",
                "years": 5,
                "initialAmount": 1000,
                "recurringContribution": 200,
                "contributionFrequency": "monthly",
                "expectedAnnualReturn": 0.08,
                "annualVolatility": 0.16,
                "inflationRate": 0.02,
                "simulationRuns": 250,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["symbol"], "MSFT")
        # companyName must be a real string, not a coroutine repr
        self.assertIsInstance(payload["companyName"], str)
        self.assertNotIn("coroutine", payload["companyName"])
        self.assertEqual(payload["projectionYears"], 5)
        self.assertEqual(payload["projectionMonths"], 60)
        self.assertEqual(len(payload["monthlyChartData"]), 60)
        self.assertEqual(payload["assumptionsUsed"]["source"], "full_override")
        self.assertIn("deterministicScenarios", payload)
        self.assertIn("monteCarloSummary", payload)
        self.assertIn("realEndValues", payload)
        self.assertIn("totalInvested", payload)
        self.assertIn("nominalProfitGain", payload)
        self.assertIn("realProfitGain", payload)
        self.assertAlmostEqual(payload["totalInvested"], 13000.0, places=4)
        self.assertAlmostEqual(
            payload["deterministicScenarios"]["pessimistic"]["annualReturnUsed"],
            0.02,
            places=6,
        )
        self.assertAlmostEqual(
            payload["deterministicScenarios"]["baseline"]["annualReturnUsed"],
            0.08,
            places=6,
        )
        self.assertAlmostEqual(
            payload["deterministicScenarios"]["optimistic"]["annualReturnUsed"],
            0.15,
            places=6,
        )
        self.assertAlmostEqual(
            payload["nominalEndValues"]["baseline"] - payload["totalInvested"],
            payload["nominalProfitGain"]["baseline"],
            places=3,
        )
        self.assertGreater(payload["projectedContributionTotal"], 0)

    @patch("app.projections.engine.fetch_company_name")
    @patch("app.projections.engine.fetch_daily_bar_rows", new_callable=AsyncMock)
    def test_long_term_projection_supports_fifty_year_monthly_output(
        self,
        mock_fetch_daily_bar_rows,
        mock_fetch_company_name,
    ):
        token = self.register_and_login(email="project50@example.com")
        mock_fetch_company_name.return_value = "Apple Inc."

        async def side_effect(symbol, start=None, end=None, asset_class=None):
            return self._projection_rows(symbol)

        mock_fetch_daily_bar_rows.side_effect = side_effect

        response = self.client.post(
            "/project/long-term",
            headers=self.auth_headers(token),
            json={
                "symbol": "AAPL",
                "years": 50,
                "initialAmount": 1000,
                "recurringContribution": 0,
                "simulationRuns": 200,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["projectionMonths"], 600)
        self.assertEqual(len(payload["monthlyChartData"]), 600)

    @patch("app.projections.engine.fetch_daily_bar_rows", new_callable=AsyncMock)
    def test_long_term_projection_rejects_invalid_ranges_and_missing_history(
        self,
        mock_fetch_daily_bar_rows,
    ):
        token = self.register_and_login(email="project-errors@example.com")

        invalid_years_response = self.client.post(
            "/project/long-term",
            headers=self.auth_headers(token),
            json={
                "symbol": "MSFT",
                "years": 51,
                "initialAmount": 1000,
            },
        )
        self.assertEqual(invalid_years_response.status_code, 400)

        invalid_runs_response = self.client.post(
            "/project/long-term",
            headers=self.auth_headers(token),
            json={
                "symbol": "MSFT",
                "years": 5,
                "initialAmount": 1000,
                "simulationRuns": 10001,
            },
        )
        self.assertEqual(invalid_runs_response.status_code, 400)

        mock_fetch_daily_bar_rows.side_effect = AlpacaMarketDataError(
            "No historical bar data is available for that symbol."
        )
        missing_history_response = self.client.post(
            "/project/long-term",
            headers=self.auth_headers(token),
            json={
                "symbol": "MSFT",
                "years": 5,
                "initialAmount": 1000,
            },
        )
        self.assertEqual(missing_history_response.status_code, 400)
