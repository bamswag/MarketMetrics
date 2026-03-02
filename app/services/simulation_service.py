from __future__ import annotations
from fastapi import HTTPException, status
from app.models.simulation import SimulationRequest, SimulationResult
from app.services.market_data_service import fetch_daily_close_series, slice_series
from app.services.alpha_vantage import fetch_company_name

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
    end_price = window[-1][1]

    if start_price <= 0:
        raise HTTPException(status_code=400, detail="Invalid starting price from data provider.")

    # Buy & Hold
    shares = req.initialAmount / start_price
    values = [shares * close for _, close in window]

    final_value = values[-1]
    profit = final_value - req.initialAmount
    total_return_pct = (profit / req.initialAmount) * 100 if req.initialAmount else 0.0
    max_dd = max_drawdown_pct(values)

    return SimulationResult(
        assetSymbol=symbol,
        startDate=req.startDate,
        endDate=req.endDate,
        initialAmount=req.initialAmount,
        companyName=company_name,
        finalValue=round(final_value, 2),
        profit=round(profit, 2),
        totalReturnPct=round(total_return_pct, 4),
        maxDrawdownPct=round(max_dd, 4),
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