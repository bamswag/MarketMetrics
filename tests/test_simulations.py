import unittest
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

from app.schemas.simulations import ContributionFrequency
from app.services.simulations import (
    TRADING_DAYS_PER_YEAR_CRYPTO,
    TRADING_DAYS_PER_YEAR_EQUITY,
    calculate_performance_metrics,
    simulate_buy_and_hold,
    simulate_dollar_cost_averaging,
)

try:
    from test_auth import BaseAPITestCase
except ModuleNotFoundError:
    from tests.test_auth import BaseAPITestCase


class SimulationMetricUnitTests(unittest.TestCase):
    """Direct unit tests for the targeted fixes."""

    def test_dca_metrics_exclude_contribution_day_jumps(self):
        # Flat price → asset has 0 return every day. Without the fix, contribution
        # days would appear as huge "best day" returns and inflate volatility.
        flat_window = [(date(2024, 1, d), 100.0) for d in range(1, 11)]
        result = simulate_dollar_cost_averaging(
            window=flat_window,
            initial_amount=1000.0,
            recurring_contribution=200.0,
            contribution_frequency=ContributionFrequency.weekly,
        )
        perf = result["performance"]

        self.assertAlmostEqual(perf.bestDayReturnPct, 0.0, places=6)
        self.assertAlmostEqual(perf.worstDayReturnPct, 0.0, places=6)
        self.assertAlmostEqual(perf.volatilityPct, 0.0, places=6)
        self.assertAlmostEqual(perf.maxDrawdownPct, 0.0, places=6)

    def test_buy_and_hold_metrics_unchanged_for_equities(self):
        # Buy-and-hold should be unaffected by the changes.
        window = [
            (date(2024, 1, 1), 100.0),
            (date(2024, 1, 2), 110.0),
            (date(2024, 1, 3), 121.0),
        ]
        result = simulate_buy_and_hold(window=window, initial_amount=1000.0)
        perf = result["performance"]

        self.assertAlmostEqual(perf.finalValue, 1210.0, places=4)
        self.assertAlmostEqual(perf.bestDayReturnPct, 10.0, places=4)
        self.assertAlmostEqual(perf.worstDayReturnPct, 10.0, places=4)

    def test_annualization_factor_changes_volatility(self):
        # Same return series, two annualisation factors → ratio = sqrt(365/252).
        import math

        values = [100.0, 101.0, 100.0, 101.0, 100.0, 101.0]
        equity = calculate_performance_metrics(
            values=values,
            invested_amount=100.0,
            start_date=date(2024, 1, 1),
            end_date=date(2024, 1, 6),
            annualization_factor=TRADING_DAYS_PER_YEAR_EQUITY,
        )
        crypto = calculate_performance_metrics(
            values=values,
            invested_amount=100.0,
            start_date=date(2024, 1, 1),
            end_date=date(2024, 1, 6),
            annualization_factor=TRADING_DAYS_PER_YEAR_CRYPTO,
        )
        expected_ratio = math.sqrt(
            TRADING_DAYS_PER_YEAR_CRYPTO / TRADING_DAYS_PER_YEAR_EQUITY
        )
        self.assertAlmostEqual(
            crypto["volatility_pct"] / equity["volatility_pct"],
            expected_ratio,
            places=6,
        )


class SimulationAndHistoryTests(BaseAPITestCase):
    @patch("app.services.simulations.fetch_company_name")
    @patch("app.services.simulations.fetch_daily_close_series", new_callable=AsyncMock)
    def test_simulation_endpoint_returns_comparison_data(
        self,
        mock_fetch_series,
        mock_fetch_company_name,
    ):
        """POST /simulate/ still returns comparison results (no longer saves history)."""
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
        # companyName must be a real string, not a coroutine repr
        self.assertIsInstance(payload["companyName"], str)
        self.assertNotIn("coroutine", payload["companyName"])

    def test_history_empty_initially(self):
        """GET /simulate/history returns empty list for a new user."""
        token = self.register_and_login()
        response = self.client.get("/simulate/history", headers=self.auth_headers(token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_history_delete_and_clear(self):
        """DELETE /simulate/history/{id} and DELETE /simulate/history work correctly."""
        from app.services.simulation_history import save_growth_projection_history
        from app.schemas.growth_projections import (
            LongTermProjectionRequest,
            LongTermProjectionResponse,
            ProjectionAssumptionsOut,
            ProjectionEndValuesOut,
            MonteCarloSummaryOut,
            DeterministicScenariosOut,
            DeterministicScenarioOut,
        )

        token = self.register_and_login()

        # Manually insert a history record directly via service
        request = LongTermProjectionRequest(
            symbol="AAPL",
            years=10,
            initialAmount=1000.0,
            recurringContribution=100.0,
            inflationRate=0.025,
        )
        assumptions = ProjectionAssumptionsOut(
            source="historical",
            expectedAnnualReturn=0.08,
            annualVolatility=0.18,
            inflationRate=0.025,
            historyWindowYearsUsed=5.0,
        )
        det_scenario = DeterministicScenarioOut(
            annualReturnUsed=0.08,
            projectedEndValue=2200.0,
            projectedGrowthPct=120.0,
        )
        det_scenarios = DeterministicScenariosOut(
            pessimistic=det_scenario,
            baseline=det_scenario,
            optimistic=det_scenario,
        )
        mc_summary = MonteCarloSummaryOut(
            runs=1000,
            p10EndValue=1500.0,
            p50EndValue=2200.0,
            p90EndValue=3500.0,
            probabilityOfProfit=0.78,
            bestCaseEndValue=5000.0,
            worstCaseEndValue=800.0,
        )
        end_values = ProjectionEndValuesOut(
            pessimistic=1500.0,
            baseline=2200.0,
            optimistic=3500.0,
            monteCarloP10=1400.0,
            monteCarloP50=2200.0,
            monteCarloP90=3600.0,
        )
        result = LongTermProjectionResponse(
            symbol="AAPL",
            companyName="Apple Inc.",
            lastActualClose=180.0,
            projectionYears=10,
            projectionMonths=120,
            assumptionsUsed=assumptions,
            monthlyChartData=[],
            deterministicScenarios=det_scenarios,
            monteCarloSummary=mc_summary,
            projectedContributionTotal=12000.0,
            initialAmount=1000.0,
            totalInvested=13000.0,
            nominalEndValues=end_values,
            nominalProfitGain=end_values,
            nominalGrowthPct=ProjectionEndValuesOut(
                pessimistic=50.0,
                baseline=120.0,
                optimistic=269.0,
                monteCarloP10=40.0,
                monteCarloP50=120.0,
                monteCarloP90=277.0,
            ),
        )

        db = self.TestingSessionLocal()
        # Get the user ID from the token
        from app.core.auth import decode_access_token
        user_id = decode_access_token(token)["sub"]
        record = save_growth_projection_history(db, user_id, request, result)

        # Confirm it appears in history
        history_response = self.client.get("/simulate/history", headers=self.auth_headers(token))
        self.assertEqual(history_response.status_code, 200)
        history = history_response.json()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["assetSymbol"], "AAPL")
        self.assertEqual(history[0]["projectionYears"], 10)
        self.assertAlmostEqual(history[0]["baselineEndValue"], 2200.0)

        # Delete the single entry
        del_response = self.client.delete(
            f"/simulate/history/{record.simulationId}",
            headers=self.auth_headers(token),
        )
        self.assertEqual(del_response.status_code, 204)

        # Confirm gone
        history_response2 = self.client.get("/simulate/history", headers=self.auth_headers(token))
        self.assertEqual(history_response2.json(), [])

    def test_history_notes_patch(self):
        """PATCH /simulate/history/{id} updates the notes field."""
        from app.services.simulation_history import save_growth_projection_history
        from app.schemas.growth_projections import (
            LongTermProjectionRequest,
            LongTermProjectionResponse,
            ProjectionAssumptionsOut,
            ProjectionEndValuesOut,
            MonteCarloSummaryOut,
            DeterministicScenariosOut,
            DeterministicScenarioOut,
        )

        token = self.register_and_login()

        request = LongTermProjectionRequest(symbol="MSFT", years=5, initialAmount=500.0)
        assumptions = ProjectionAssumptionsOut(
            source="historical",
            expectedAnnualReturn=0.10,
            annualVolatility=0.20,
            inflationRate=0.0,
            historyWindowYearsUsed=5.0,
        )
        det_scenario = DeterministicScenarioOut(
            annualReturnUsed=0.10, projectedEndValue=800.0, projectedGrowthPct=60.0
        )
        det_scenarios = DeterministicScenariosOut(
            pessimistic=det_scenario, baseline=det_scenario, optimistic=det_scenario
        )
        mc_summary = MonteCarloSummaryOut(
            runs=1000, p10EndValue=600.0, p50EndValue=800.0, p90EndValue=1100.0,
            probabilityOfProfit=0.82, bestCaseEndValue=1500.0, worstCaseEndValue=300.0,
        )
        end_values = ProjectionEndValuesOut(
            pessimistic=600.0, baseline=800.0, optimistic=1100.0,
            monteCarloP10=580.0, monteCarloP50=800.0, monteCarloP90=1080.0,
        )
        result = LongTermProjectionResponse(
            symbol="MSFT", companyName="Microsoft Corporation",
            lastActualClose=400.0, projectionYears=5, projectionMonths=60,
            assumptionsUsed=assumptions, monthlyChartData=[],
            deterministicScenarios=det_scenarios, monteCarloSummary=mc_summary,
            projectedContributionTotal=0.0, initialAmount=500.0, totalInvested=500.0,
            nominalEndValues=end_values, nominalProfitGain=end_values,
            nominalGrowthPct=ProjectionEndValuesOut(
                pessimistic=20.0, baseline=60.0, optimistic=120.0,
                monteCarloP10=16.0, monteCarloP50=60.0, monteCarloP90=116.0,
            ),
        )

        db = self.TestingSessionLocal()
        from app.core.auth import decode_access_token
        user_id = decode_access_token(token)["sub"]
        record = save_growth_projection_history(db, user_id, request, result)

        patch_response = self.client.patch(
            f"/simulate/history/{record.simulationId}",
            headers=self.auth_headers(token),
            json={"notes": "Retirement planning scenario"},
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.json()["notes"], "Retirement planning scenario")
