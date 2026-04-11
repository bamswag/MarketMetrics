from __future__ import annotations

import math
from datetime import date
from statistics import pstdev
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from app.schemas.simulations import (
    ComparisonSummary,
    ContributionFrequency,
    SimulationChartPoint,
    SimulationRequest,
    SimulationResult,
    SimulationStrategy,
    StrategyPerformance,
)
from app.services.price_history import fetch_daily_close_series, slice_series
from app.services.search import resolve_company_name as fetch_company_name


async def run_simulation(req: SimulationRequest) -> SimulationResult:
    symbol = req.assetSymbol.strip().upper()
    company_name = await fetch_company_name(symbol)

    # Fetch daily closes
    try:
        full_series = await fetch_daily_close_series(symbol)
    except Exception as e:
        # Map upstream issues to a clean API error
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    window = slice_series(full_series, req.startDate, req.endDate)

    if len(window) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not enough price data for that date range (try a different range).",
        )

    start_price = window[0][1]

    if start_price <= 0:
        raise HTTPException(status_code=400, detail="Invalid starting price from data provider.")

    buy_and_hold = simulate_buy_and_hold(window, req.initialAmount)
    comparison = [buy_and_hold["performance"]]
    chart_data = build_chart_data(window, buy_and_hold, None)
    selected = buy_and_hold["performance"]

    if req.recurringContribution > 0:
        dca = simulate_dollar_cost_averaging(
            window,
            req.initialAmount,
            req.recurringContribution,
            req.contributionFrequency,
        )
        if req.strategy == SimulationStrategy.dollar_cost_averaging and dca["performance"].contributionCount == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Date range is too short for the selected recurring contribution schedule.",
            )
        comparison.append(dca["performance"])
        chart_data = build_chart_data(window, buy_and_hold, dca)

        if req.strategy == SimulationStrategy.dollar_cost_averaging:
            selected = dca["performance"]

    comparison_summary = build_comparison_summary(comparison)

    return SimulationResult(
        assetSymbol=symbol,
        startDate=req.startDate,
        endDate=req.endDate,
        initialAmount=req.initialAmount,
        selectedStrategy=selected.strategy,
        recurringContribution=req.recurringContribution,
        contributionFrequency=req.contributionFrequency,
        investedAmount=round(selected.investedAmount, 2),
        companyName=company_name,
        finalValue=round(selected.finalValue, 2),
        profit=round(selected.profit, 2),
        totalReturnPct=round(selected.totalReturnPct, 4),
        annualizedReturnPct=round(selected.annualizedReturnPct, 4),
        volatilityPct=round(selected.volatilityPct, 4),
        maxDrawdownPct=round(selected.maxDrawdownPct, 4),
        comparison=[
            StrategyPerformance(
                strategy=item.strategy,
                investedAmount=round(item.investedAmount, 2),
                finalValue=round(item.finalValue, 2),
                profit=round(item.profit, 2),
                totalReturnPct=round(item.totalReturnPct, 4),
                annualizedReturnPct=round(item.annualizedReturnPct, 4),
                volatilityPct=round(item.volatilityPct, 4),
                maxDrawdownPct=round(item.maxDrawdownPct, 4),
                bestDayReturnPct=round(item.bestDayReturnPct, 4),
                worstDayReturnPct=round(item.worstDayReturnPct, 4),
                contributionCount=item.contributionCount,
            )
            for item in comparison
        ],
        comparisonSummary=ComparisonSummary(
            bestStrategy=comparison_summary.bestStrategy,
            bestFinalValue=round(comparison_summary.bestFinalValue, 2),
            bestReturnPct=round(comparison_summary.bestReturnPct, 4),
            finalValueGap=round(comparison_summary.finalValueGap, 2),
            returnGapPct=round(comparison_summary.returnGapPct, 4),
        ),
        chartData=chart_data,
    )


def max_drawdown_pct(values: list[float]) -> float:
    if not values:
        return 0.0
    peak = values[0]
    max_dd = 0.0
    for v in values:
        if v > peak:
            peak = v
        dd = (peak - v) / peak if peak else 0.0
        if dd > max_dd:
            max_dd = dd
    return max_dd * 100


def simulate_buy_and_hold(
    window: List[Tuple[date, float]],
    initial_amount: float,
) -> Dict[str, object]:
    shares = initial_amount / window[0][1]
    values = [shares * close for _, close in window]
    invested_series = [initial_amount for _ in window]
    final_value = values[-1]
    profit = final_value - initial_amount
    metrics = calculate_performance_metrics(
        values=values,
        invested_amount=initial_amount,
        start_date=window[0][0],
        end_date=window[-1][0],
    )

    return {
        "values": values,
        "invested_series": invested_series,
        "contributions": [0.0 for _ in window],
        "performance": StrategyPerformance(
            strategy=SimulationStrategy.buy_and_hold,
            investedAmount=initial_amount,
            finalValue=final_value,
            profit=profit,
            totalReturnPct=metrics["total_return_pct"],
            annualizedReturnPct=metrics["annualized_return_pct"],
            volatilityPct=metrics["volatility_pct"],
            maxDrawdownPct=metrics["max_drawdown_pct"],
            bestDayReturnPct=metrics["best_day_return_pct"],
            worstDayReturnPct=metrics["worst_day_return_pct"],
            contributionCount=0,
        ),
    }


def simulate_dollar_cost_averaging(
    window: List[Tuple[date, float]],
    initial_amount: float,
    recurring_contribution: float,
    contribution_frequency: ContributionFrequency,
) -> Dict[str, object]:
    shares = initial_amount / window[0][1]
    values = [shares * window[0][1]]
    invested_series = [initial_amount]
    contributions = [0.0]
    invested_amount = initial_amount
    contribution_count = 0
    current_period = _period_key(window[0][0], contribution_frequency)

    for current_date, close in window[1:]:
        period = _period_key(current_date, contribution_frequency)
        contribution_amount = 0.0
        if period != current_period:
            shares += recurring_contribution / close
            invested_amount += recurring_contribution
            contribution_count += 1
            current_period = period
            contribution_amount = recurring_contribution

        values.append(shares * close)
        invested_series.append(invested_amount)
        contributions.append(contribution_amount)

    final_value = values[-1]
    profit = final_value - invested_amount
    metrics = calculate_performance_metrics(
        values=values,
        invested_amount=invested_amount,
        start_date=window[0][0],
        end_date=window[-1][0],
    )

    return {
        "values": values,
        "invested_series": invested_series,
        "contributions": contributions,
        "performance": StrategyPerformance(
            strategy=SimulationStrategy.dollar_cost_averaging,
            investedAmount=invested_amount,
            finalValue=final_value,
            profit=profit,
            totalReturnPct=metrics["total_return_pct"],
            annualizedReturnPct=metrics["annualized_return_pct"],
            volatilityPct=metrics["volatility_pct"],
            maxDrawdownPct=metrics["max_drawdown_pct"],
            bestDayReturnPct=metrics["best_day_return_pct"],
            worstDayReturnPct=metrics["worst_day_return_pct"],
            contributionCount=contribution_count,
        ),
    }


def build_chart_data(
    window: List[Tuple[date, float]],
    buy_and_hold: Dict[str, object],
    dca: Optional[Dict[str, object]],
) -> List[SimulationChartPoint]:
    chart_points: List[SimulationChartPoint] = []
    buy_values = buy_and_hold["values"]
    buy_invested = buy_and_hold["invested_series"]
    dca_values = dca["values"] if dca else None
    dca_invested = dca["invested_series"] if dca else None
    dca_contributions = dca["contributions"] if dca else None

    for index, (point_date, _) in enumerate(window):
        contribution_amount = round(dca_contributions[index], 2) if dca_contributions else None
        chart_points.append(
            SimulationChartPoint(
                date=point_date,
                buyAndHoldValue=round(buy_values[index], 2),
                buyAndHoldInvestedCapital=round(buy_invested[index], 2),
                dollarCostAveragingValue=round(dca_values[index], 2) if dca_values else None,
                dollarCostAveragingInvestedCapital=round(dca_invested[index], 2)
                if dca_invested
                else None,
                contributionAmount=contribution_amount,
                contributionOccurred=bool(contribution_amount),
            )
        )
    return chart_points


def _period_key(point_date: date, frequency: ContributionFrequency) -> tuple:
    if frequency == ContributionFrequency.weekly:
        iso = point_date.isocalendar()
        return iso[0], iso[1]
    if frequency == ContributionFrequency.quarterly:
        quarter = ((point_date.month - 1) // 3) + 1
        return point_date.year, quarter
    return point_date.year, point_date.month


def calculate_performance_metrics(
    *,
    values: List[float],
    invested_amount: float,
    start_date: date,
    end_date: date,
) -> Dict[str, float]:
    daily_returns = calculate_daily_returns(values)
    total_return_pct = ((values[-1] - invested_amount) / invested_amount) * 100 if invested_amount else 0.0
    years = max((end_date - start_date).days / 365.25, 1 / 365.25)
    annualized_return_pct = calculate_annualized_return_pct(
        final_value=values[-1],
        invested_amount=invested_amount,
        years=years,
    )
    volatility_pct = pstdev(daily_returns) * math.sqrt(252) * 100 if len(daily_returns) > 1 else 0.0

    return {
        "total_return_pct": total_return_pct,
        "annualized_return_pct": annualized_return_pct,
        "volatility_pct": volatility_pct,
        "max_drawdown_pct": max_drawdown_pct(values),
        "best_day_return_pct": max(daily_returns) * 100 if daily_returns else 0.0,
        "worst_day_return_pct": min(daily_returns) * 100 if daily_returns else 0.0,
    }


def calculate_daily_returns(values: List[float]) -> List[float]:
    returns: List[float] = []
    for previous, current in zip(values, values[1:]):
        if previous <= 0:
            returns.append(0.0)
        else:
            returns.append((current - previous) / previous)
    return returns


def calculate_annualized_return_pct(
    *,
    final_value: float,
    invested_amount: float,
    years: float,
) -> float:
    if invested_amount <= 0 or final_value <= 0 or years <= 0:
        return 0.0
    return ((final_value / invested_amount) ** (1 / years) - 1) * 100


def build_comparison_summary(comparison: List[StrategyPerformance]) -> ComparisonSummary:
    sorted_results = sorted(comparison, key=lambda item: item.finalValue, reverse=True)
    best = sorted_results[0]
    second = sorted_results[1] if len(sorted_results) > 1 else best

    return ComparisonSummary(
        bestStrategy=best.strategy,
        bestFinalValue=best.finalValue,
        bestReturnPct=best.totalReturnPct,
        finalValueGap=best.finalValue - second.finalValue,
        returnGapPct=best.totalReturnPct - second.totalReturnPct,
    )
