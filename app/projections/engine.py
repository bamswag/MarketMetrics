from __future__ import annotations

import math
from calendar import monthrange
from datetime import date, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from app.integrations.alpaca.market_data import fetch_daily_bar_rows
from app.schemas.growth_projections import (
    DeterministicScenarioOut,
    DeterministicScenariosOut,
    LongTermProjectionRequest,
    LongTermProjectionResponse,
    MonteCarloSummaryOut,
    MonthlyProjectionPoint,
    ProjectionAssumptionsOut,
    ProjectionContributionFrequency,
    ProjectionEndValuesOut,
)
from app.services.search import resolve_company_name as fetch_company_name


DEFAULT_PROJECTION_HISTORY_DAYS = 3650
MIN_HISTORY_MONTHS = 36
MAX_PROJECTION_YEARS = 50
MAX_SIMULATION_RUNS = 10000
MONTE_CARLO_SEED = 42
FIXED_SCENARIO_VOLATILITY_MULTIPLIER = 0.5
FIXED_SCENARIO_FLOOR = 0.02
FIXED_SCENARIO_CEILING = 0.15


class LongTermProjectionError(Exception):
    pass


def _require_projection_dependencies():
    try:
        import numpy as np
        import pandas as pd
    except ImportError as exc:
        raise LongTermProjectionError(
            "Projection dependencies are not installed. Install requirements.txt to use long-term projections."
        ) from exc
    return pd, np


def _round_money(value: float) -> float:
    return round(float(value), 4)


def _round_rate(value: float) -> float:
    return round(float(value), 6)


def _round_pct(value: float) -> float:
    return round(float(value), 4)


def _validate_request(request: LongTermProjectionRequest) -> None:
    if not request.symbol.strip():
        raise LongTermProjectionError("symbol is required.")
    if request.years < 1 or request.years > MAX_PROJECTION_YEARS:
        raise LongTermProjectionError("years must be between 1 and 50.")
    if request.initialAmount <= 0:
        raise LongTermProjectionError("initialAmount must be greater than 0.")
    if request.recurringContribution < 0:
        raise LongTermProjectionError("recurringContribution cannot be negative.")
    if request.expectedAnnualReturn is not None and request.expectedAnnualReturn <= -0.95:
        raise LongTermProjectionError("expectedAnnualReturn must be greater than -0.95.")
    if request.annualVolatility is not None and request.annualVolatility < 0:
        raise LongTermProjectionError("annualVolatility cannot be negative.")
    if request.inflationRate < 0:
        raise LongTermProjectionError("inflationRate cannot be negative.")
    if request.simulationRuns < 1:
        raise LongTermProjectionError("simulationRuns must be greater than 0.")
    if request.simulationRuns > MAX_SIMULATION_RUNS:
        raise LongTermProjectionError("simulationRuns cannot exceed 10000.")


def resample_to_month_end_closes(rows: Sequence[Dict[str, float]]) -> List[Tuple[date, float]]:
    pd, _ = _require_projection_dependencies()

    frame = pd.DataFrame(rows)
    if frame.empty:
        return []

    frame["date"] = pd.to_datetime(frame["date"])
    frame = frame.sort_values("date").drop_duplicates("date", keep="last")
    frame["year_month"] = frame["date"].dt.to_period("M")
    monthly = frame.groupby("year_month", as_index=False).last()[["date", "close"]]

    return [
        (point_date.date(), float(close))
        for point_date, close in zip(monthly["date"], monthly["close"])
    ]


def derive_historical_projection_assumptions(
    rows: Sequence[Dict[str, float]],
) -> Dict[str, float]:
    _, np = _require_projection_dependencies()

    monthly_closes = resample_to_month_end_closes(rows)
    if len(monthly_closes) < MIN_HISTORY_MONTHS:
        raise LongTermProjectionError(
            "At least 3 years of monthly history is required to derive projection defaults."
        )

    monthly_closes = monthly_closes[-120:]
    prices = np.array([close for _, close in monthly_closes], dtype=float)
    monthly_returns = (prices[1:] / prices[:-1]) - 1
    if len(monthly_returns) < (MIN_HISTORY_MONTHS - 1):
        raise LongTermProjectionError(
            "At least 3 years of monthly history is required to derive projection defaults."
        )

    compounded_monthly_return = float((prices[-1] / prices[0]) ** (1 / len(monthly_returns)) - 1)
    annualized_return = float((1 + compounded_monthly_return) ** 12 - 1)
    annualized_volatility = float(monthly_returns.std(ddof=0) * math.sqrt(12))

    return {
        "expectedAnnualReturn": annualized_return,
        "annualVolatility": annualized_volatility,
        "historyWindowYearsUsed": round(len(monthly_returns) / 12, 2),
    }


def build_projection_month_end_dates(last_date: date, projection_months: int) -> List[date]:
    dates: List[date] = []

    def _add_months(year: int, month: int, offset: int) -> Tuple[int, int]:
        zero_based = (year * 12 + (month - 1)) + offset
        return zero_based // 12, (zero_based % 12) + 1

    current_month_end = monthrange(last_date.year, last_date.month)[1]
    first_offset = 1 if last_date.day >= current_month_end else 0

    for offset in range(first_offset, first_offset + projection_months):
        year_value, month_value = _add_months(last_date.year, last_date.month, offset)
        month_end_day = monthrange(year_value, month_value)[1]
        point_date = date(year_value, month_value, month_end_day)
        if point_date <= last_date:
            continue
        dates.append(point_date)

    return dates[:projection_months]


def _contribution_interval(frequency: ProjectionContributionFrequency) -> int:
    if frequency == ProjectionContributionFrequency.quarterly:
        return 3
    if frequency == ProjectionContributionFrequency.yearly:
        return 12
    return 1


def _is_contribution_month(month_index: int, frequency: ProjectionContributionFrequency) -> bool:
    return month_index % _contribution_interval(frequency) == 0


def _monthly_rate_from_annual(annual_rate: float) -> float:
    clamped_rate = max(annual_rate, -0.95)
    return (1 + clamped_rate) ** (1 / 12) - 1


def calibrate_fixed_scenario_returns(
    *,
    baseline_return: float,
    annual_volatility: float,
) -> Tuple[float, float]:
    offset = annual_volatility * FIXED_SCENARIO_VOLATILITY_MULTIPLIER
    pessimistic_return = baseline_return - offset
    optimistic_return = baseline_return + offset

    if baseline_return >= FIXED_SCENARIO_FLOOR:
        pessimistic_return = max(pessimistic_return, FIXED_SCENARIO_FLOOR)
    pessimistic_return = min(pessimistic_return, baseline_return)

    if baseline_return <= FIXED_SCENARIO_CEILING:
        optimistic_return = min(optimistic_return, FIXED_SCENARIO_CEILING)
    optimistic_return = max(optimistic_return, baseline_return)

    return pessimistic_return, optimistic_return


def build_deterministic_projection_path(
    *,
    initial_amount: float,
    projection_dates: Sequence[date],
    annual_return: float,
    recurring_contribution: float,
    contribution_frequency: ProjectionContributionFrequency,
) -> Dict[str, object]:
    portfolio_value = initial_amount
    invested_capital = initial_amount
    contribution_total = 0.0
    monthly_values: List[float] = []
    invested_capital_series: List[float] = []

    monthly_rate = _monthly_rate_from_annual(annual_return)

    for month_index, _ in enumerate(projection_dates, start=1):
        portfolio_value *= 1 + monthly_rate
        if recurring_contribution > 0 and _is_contribution_month(month_index, contribution_frequency):
            portfolio_value += recurring_contribution
            invested_capital += recurring_contribution
            contribution_total += recurring_contribution

        monthly_values.append(portfolio_value)
        invested_capital_series.append(invested_capital)

    growth_pct = (
        ((portfolio_value - invested_capital) / invested_capital) * 100 if invested_capital else 0.0
    )

    return {
        "monthlyValues": monthly_values,
        "investedCapitalSeries": invested_capital_series,
        "projectedEndValue": portfolio_value,
        "projectedGrowthPct": growth_pct,
        "projectedContributionTotal": contribution_total,
    }


def run_monte_carlo_projection(
    *,
    initial_amount: float,
    projection_months: int,
    annual_return: float,
    annual_volatility: float,
    recurring_contribution: float,
    contribution_frequency: ProjectionContributionFrequency,
    simulation_runs: int,
) -> Dict[str, object]:
    _, np = _require_projection_dependencies()

    monthly_sigma = annual_volatility / math.sqrt(12)
    monthly_log_mean = math.log1p(max(annual_return, -0.95)) / 12
    rng = np.random.default_rng(MONTE_CARLO_SEED)
    log_returns = rng.normal(
        loc=monthly_log_mean - 0.5 * (monthly_sigma ** 2),
        scale=monthly_sigma,
        size=(simulation_runs, projection_months),
    )
    monthly_returns = np.exp(log_returns) - 1
    monthly_returns = np.clip(monthly_returns, -0.95, None)

    portfolio_values = np.full(simulation_runs, initial_amount, dtype=float)
    path_values = np.zeros((simulation_runs, projection_months), dtype=float)
    invested_capital = initial_amount
    projected_contribution_total = 0.0

    for month_index in range(1, projection_months + 1):
        portfolio_values *= 1 + monthly_returns[:, month_index - 1]
        if recurring_contribution > 0 and _is_contribution_month(month_index, contribution_frequency):
            portfolio_values += recurring_contribution
            invested_capital += recurring_contribution
            projected_contribution_total += recurring_contribution
        path_values[:, month_index - 1] = portfolio_values

    p10_series = np.percentile(path_values, 10, axis=0)
    p50_series = np.percentile(path_values, 50, axis=0)
    p90_series = np.percentile(path_values, 90, axis=0)
    final_values = path_values[:, -1]

    return {
        "p10Series": p10_series.tolist(),
        "p50Series": p50_series.tolist(),
        "p90Series": p90_series.tolist(),
        "p10EndValue": float(np.percentile(final_values, 10)),
        "p50EndValue": float(np.percentile(final_values, 50)),
        "p90EndValue": float(np.percentile(final_values, 90)),
        "bestCaseEndValue": float(np.max(final_values)),
        "worstCaseEndValue": float(np.min(final_values)),
        "probabilityOfProfit": float(np.mean(final_values > invested_capital)),
        "projectedContributionTotal": projected_contribution_total,
        "finalInvestedCapital": invested_capital,
        "runs": simulation_runs,
    }


def _build_assumptions(
    request: LongTermProjectionRequest,
    historical_defaults: Dict[str, float],
) -> ProjectionAssumptionsOut:
    has_return_override = request.expectedAnnualReturn is not None
    has_vol_override = request.annualVolatility is not None

    if has_return_override and has_vol_override:
        source = "full_override"
    elif has_return_override or has_vol_override:
        source = "partial_override"
    else:
        source = "historical_defaults"

    return ProjectionAssumptionsOut(
        source=source,
        expectedAnnualReturn=_round_rate(
            request.expectedAnnualReturn
            if has_return_override
            else historical_defaults["expectedAnnualReturn"]
        ),
        annualVolatility=_round_rate(
            request.annualVolatility
            if has_vol_override
            else historical_defaults["annualVolatility"]
        ),
        inflationRate=_round_rate(request.inflationRate),
        historyWindowYearsUsed=round(float(historical_defaults["historyWindowYearsUsed"]), 2),
    )


def _end_value_block(
    *,
    pessimistic: float,
    baseline: float,
    optimistic: float,
    mc_p10: float,
    mc_p50: float,
    mc_p90: float,
) -> ProjectionEndValuesOut:
    return ProjectionEndValuesOut(
        pessimistic=_round_money(pessimistic),
        baseline=_round_money(baseline),
        optimistic=_round_money(optimistic),
        monteCarloP10=_round_money(mc_p10),
        monteCarloP50=_round_money(mc_p50),
        monteCarloP90=_round_money(mc_p90),
    )


def _profit_gain_block(
    *,
    total_invested: float,
    pessimistic: float,
    baseline: float,
    optimistic: float,
    mc_p10: float,
    mc_p50: float,
    mc_p90: float,
) -> ProjectionEndValuesOut:
    return _end_value_block(
        pessimistic=pessimistic - total_invested,
        baseline=baseline - total_invested,
        optimistic=optimistic - total_invested,
        mc_p10=mc_p10 - total_invested,
        mc_p50=mc_p50 - total_invested,
        mc_p90=mc_p90 - total_invested,
    )


async def project_long_term(request: LongTermProjectionRequest) -> LongTermProjectionResponse:
    _validate_request(request)

    history_end = date.today()
    history_start = history_end - timedelta(days=DEFAULT_PROJECTION_HISTORY_DAYS)
    symbol = request.symbol.strip().upper()

    rows = await fetch_daily_bar_rows(symbol, start=history_start, end=history_end)
    company_name = await fetch_company_name(symbol)
    if not rows:
        raise LongTermProjectionError("No historical data is available for that symbol.")

    historical_defaults = derive_historical_projection_assumptions(rows)
    assumptions_used = _build_assumptions(request, historical_defaults)

    projection_months = request.years * 12
    projection_dates = build_projection_month_end_dates(rows[-1]["date"], projection_months)
    if len(projection_dates) != projection_months:
        raise LongTermProjectionError("Unable to generate the requested monthly projection range.")

    baseline_return = assumptions_used.expectedAnnualReturn
    annual_volatility = assumptions_used.annualVolatility
    pessimistic_return, optimistic_return = calibrate_fixed_scenario_returns(
        baseline_return=baseline_return,
        annual_volatility=annual_volatility,
    )

    pessimistic = build_deterministic_projection_path(
        initial_amount=request.initialAmount,
        projection_dates=projection_dates,
        annual_return=pessimistic_return,
        recurring_contribution=request.recurringContribution,
        contribution_frequency=request.contributionFrequency,
    )
    baseline = build_deterministic_projection_path(
        initial_amount=request.initialAmount,
        projection_dates=projection_dates,
        annual_return=baseline_return,
        recurring_contribution=request.recurringContribution,
        contribution_frequency=request.contributionFrequency,
    )
    optimistic = build_deterministic_projection_path(
        initial_amount=request.initialAmount,
        projection_dates=projection_dates,
        annual_return=optimistic_return,
        recurring_contribution=request.recurringContribution,
        contribution_frequency=request.contributionFrequency,
    )

    monte_carlo = run_monte_carlo_projection(
        initial_amount=request.initialAmount,
        projection_months=projection_months,
        annual_return=baseline_return,
        annual_volatility=annual_volatility,
        recurring_contribution=request.recurringContribution,
        contribution_frequency=request.contributionFrequency,
        simulation_runs=request.simulationRuns,
    )

    monthly_chart_data = [
        MonthlyProjectionPoint(
            date=projection_dates[index],
            investedCapital=_round_money(baseline["investedCapitalSeries"][index]),
            pessimisticValue=_round_money(pessimistic["monthlyValues"][index]),
            baselineValue=_round_money(baseline["monthlyValues"][index]),
            optimisticValue=_round_money(optimistic["monthlyValues"][index]),
            monteCarloP10=_round_money(monte_carlo["p10Series"][index]),
            monteCarloP50=_round_money(monte_carlo["p50Series"][index]),
            monteCarloP90=_round_money(monte_carlo["p90Series"][index]),
        )
        for index in range(projection_months)
    ]

    deterministic_scenarios = DeterministicScenariosOut(
        pessimistic=DeterministicScenarioOut(
            annualReturnUsed=_round_rate(pessimistic_return),
            projectedEndValue=_round_money(pessimistic["projectedEndValue"]),
            projectedGrowthPct=_round_pct(pessimistic["projectedGrowthPct"]),
        ),
        baseline=DeterministicScenarioOut(
            annualReturnUsed=_round_rate(baseline_return),
            projectedEndValue=_round_money(baseline["projectedEndValue"]),
            projectedGrowthPct=_round_pct(baseline["projectedGrowthPct"]),
        ),
        optimistic=DeterministicScenarioOut(
            annualReturnUsed=_round_rate(optimistic_return),
            projectedEndValue=_round_money(optimistic["projectedEndValue"]),
            projectedGrowthPct=_round_pct(optimistic["projectedGrowthPct"]),
        ),
    )

    monte_carlo_summary = MonteCarloSummaryOut(
        runs=monte_carlo["runs"],
        p10EndValue=_round_money(monte_carlo["p10EndValue"]),
        p50EndValue=_round_money(monte_carlo["p50EndValue"]),
        p90EndValue=_round_money(monte_carlo["p90EndValue"]),
        probabilityOfProfit=round(float(monte_carlo["probabilityOfProfit"]), 4),
        bestCaseEndValue=_round_money(monte_carlo["bestCaseEndValue"]),
        worstCaseEndValue=_round_money(monte_carlo["worstCaseEndValue"]),
    )

    nominal_end_values = _end_value_block(
        pessimistic=pessimistic["projectedEndValue"],
        baseline=baseline["projectedEndValue"],
        optimistic=optimistic["projectedEndValue"],
        mc_p10=monte_carlo["p10EndValue"],
        mc_p50=monte_carlo["p50EndValue"],
        mc_p90=monte_carlo["p90EndValue"],
    )

    total_invested = float(monte_carlo["finalInvestedCapital"])

    nominal_profit_gain = _profit_gain_block(
        total_invested=total_invested,
        pessimistic=pessimistic["projectedEndValue"],
        baseline=baseline["projectedEndValue"],
        optimistic=optimistic["projectedEndValue"],
        mc_p10=monte_carlo["p10EndValue"],
        mc_p50=monte_carlo["p50EndValue"],
        mc_p90=monte_carlo["p90EndValue"],
    )

    nominal_growth_pct = _end_value_block(
        pessimistic=pessimistic["projectedGrowthPct"],
        baseline=baseline["projectedGrowthPct"],
        optimistic=optimistic["projectedGrowthPct"],
        mc_p10=((monte_carlo["p10EndValue"] - total_invested) / total_invested) * 100,
        mc_p50=((monte_carlo["p50EndValue"] - total_invested) / total_invested) * 100,
        mc_p90=((monte_carlo["p90EndValue"] - total_invested) / total_invested) * 100,
    )

    real_end_values = None
    real_profit_gain = None
    real_growth_pct = None
    if assumptions_used.inflationRate > 0:
        inflation_discount = (1 + assumptions_used.inflationRate) ** request.years
        real_end_values = _end_value_block(
            pessimistic=pessimistic["projectedEndValue"] / inflation_discount,
            baseline=baseline["projectedEndValue"] / inflation_discount,
            optimistic=optimistic["projectedEndValue"] / inflation_discount,
            mc_p10=monte_carlo["p10EndValue"] / inflation_discount,
            mc_p50=monte_carlo["p50EndValue"] / inflation_discount,
            mc_p90=monte_carlo["p90EndValue"] / inflation_discount,
        )
        real_profit_gain = _profit_gain_block(
            total_invested=total_invested,
            pessimistic=pessimistic["projectedEndValue"] / inflation_discount,
            baseline=baseline["projectedEndValue"] / inflation_discount,
            optimistic=optimistic["projectedEndValue"] / inflation_discount,
            mc_p10=monte_carlo["p10EndValue"] / inflation_discount,
            mc_p50=monte_carlo["p50EndValue"] / inflation_discount,
            mc_p90=monte_carlo["p90EndValue"] / inflation_discount,
        )
        real_growth_pct = _end_value_block(
            pessimistic=((pessimistic["projectedEndValue"] / inflation_discount - total_invested) / total_invested) * 100,
            baseline=((baseline["projectedEndValue"] / inflation_discount - total_invested) / total_invested) * 100,
            optimistic=((optimistic["projectedEndValue"] / inflation_discount - total_invested) / total_invested) * 100,
            mc_p10=((monte_carlo["p10EndValue"] / inflation_discount - total_invested) / total_invested) * 100,
            mc_p50=((monte_carlo["p50EndValue"] / inflation_discount - total_invested) / total_invested) * 100,
            mc_p90=((monte_carlo["p90EndValue"] / inflation_discount - total_invested) / total_invested) * 100,
        )

    return LongTermProjectionResponse(
        symbol=symbol,
        companyName=company_name,
        lastActualClose=_round_money(rows[-1]["close"]),
        projectionYears=request.years,
        projectionMonths=projection_months,
        assumptionsUsed=assumptions_used,
        monthlyChartData=monthly_chart_data,
        deterministicScenarios=deterministic_scenarios,
        monteCarloSummary=monte_carlo_summary,
        projectedContributionTotal=_round_money(baseline["projectedContributionTotal"]),
        initialAmount=_round_money(request.initialAmount),
        totalInvested=_round_money(total_invested),
        nominalEndValues=nominal_end_values,
        nominalProfitGain=nominal_profit_gain,
        nominalGrowthPct=nominal_growth_pct,
        realEndValues=real_end_values,
        realProfitGain=real_profit_gain,
        realGrowthPct=real_growth_pct,
    )
