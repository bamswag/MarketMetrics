from __future__ import annotations

import asyncio
import time
from datetime import date
from typing import Dict, List, Optional, Tuple

from app.integrations.alpaca.market_data import (
    fetch_daily_bar_rows,
    fetch_daily_close_series as fetch_alpaca_daily_close_series,
)

HistoryCacheKey = Tuple[str, Optional[str], Optional[str]]

_history_cache: Dict[HistoryCacheKey, Tuple[float, List[Tuple[date, float]]]] = {}
_history_locks: Dict[HistoryCacheKey, asyncio.Lock] = {}


def _history_cache_key(
    symbol: str,
    start: Optional[date],
    end: Optional[date],
) -> HistoryCacheKey:
    return (
        symbol.strip().upper(),
        start.isoformat() if start else None,
        end.isoformat() if end else None,
    )


async def fetch_daily_close_series(
    symbol: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> List[Tuple[date, float]]:
    return await fetch_alpaca_daily_close_series(symbol, start=start, end=end)


async def get_daily_close_series_cached(
    symbol: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
    min_ttl_seconds: int = 300,
) -> List[Tuple[date, float]]:
    now = time.time()
    key = _history_cache_key(symbol, start, end)

    if key in _history_cache:
        cached_at, payload = _history_cache[key]
        if now - cached_at < min_ttl_seconds:
            return list(payload)

    lock = _history_locks.setdefault(key, asyncio.Lock())
    async with lock:
        now = time.time()
        if key in _history_cache:
            cached_at, payload = _history_cache[key]
            if now - cached_at < min_ttl_seconds:
                return list(payload)

        payload = await fetch_daily_close_series(symbol, start=start, end=end)
        _history_cache[key] = (time.time(), payload)
        return list(payload)


async def fetch_daily_bar_series(symbol: str) -> List[dict]:
    return await fetch_daily_bar_rows(symbol)


def slice_series(series: List[Tuple[date, float]], start: date, end: date) -> List[Tuple[date, float]]:
    return [(point_date, close) for (point_date, close) in series if start <= point_date <= end]
