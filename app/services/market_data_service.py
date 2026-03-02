from __future__ import annotations

from datetime import date, datetime
from typing import Dict, List, Tuple

import httpx

from app.services.alpha_vantage import BASE_URL, _get_api_key, AlphaVantageError


async def fetch_daily_close_series(symbol: str) -> List[Tuple[date, float]]:
    """
    Returns list of (date, close) sorted ascending.
    """
    params = {
        "function": "TIME_SERIES_DAILY_ADJUSTED",
        "symbol": symbol,
        "outputsize": "full",
        "apikey": _get_api_key(),
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(BASE_URL, params=params)

    if resp.status_code != 200:
        raise AlphaVantageError(f"Alpha Vantage HTTP {resp.status_code}")

    data = resp.json()

    # Handle AV special responses
    if "Error Message" in data:
        raise AlphaVantageError(data["Error Message"])
    if "Information" in data:
        raise AlphaVantageError(data["Information"])
    if "Note" in data:
        raise AlphaVantageError(data["Note"])

    ts = data.get("Time Series (Daily)")
    if not ts:
        raise AlphaVantageError("Missing 'Time Series (Daily)' in Alpha Vantage response")

    series: List[Tuple[date, float]] = []
    for d_str, row in ts.items():
        try:
            d = datetime.strptime(d_str, "%Y-%m-%d").date()
            close = float(row["4. close"])
            series.append((d, close))
        except Exception:
            continue

    series.sort(key=lambda x: x[0])
    return series


def slice_series(series: List[Tuple[date, float]], start: date, end: date) -> List[Tuple[date, float]]:
    return [(d, c) for (d, c) in series if start <= d <= end]