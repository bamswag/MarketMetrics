from __future__ import annotations

import asyncio
import time
from datetime import date
from typing import Dict, List, Optional, Tuple

from app.integrations.alpaca.market_data import (
    fetch_daily_bar_rows,
    fetch_daily_close_series as fetch_alpaca_daily_close_series,
)
from app.services.search import get_symbol_asset_class

HistoryCacheKey = Tuple[str, str, Optional[str], Optional[str]]

_history_cache: Dict[HistoryCacheKey, Tuple[float, List[Tuple[date, float]]]] = {}
_history_locks: Dict[HistoryCacheKey, asyncio.Lock] = {}

# Historical series can be much larger than quote snapshots, so keep this cache
# intentionally smaller and short-lived to avoid steady process growth.
_CACHE_MAX_SIZE = 128
_CACHE_HARD_TTL_SECONDS = 600


def _history_cache_key(
    symbol: str,
    asset_class: str,
    start: Optional[date],
    end: Optional[date],
) -> HistoryCacheKey:
    return (
        symbol.strip().upper(),
        asset_class,
        start.isoformat() if start else None,
        end.isoformat() if end else None,
    )


def _evict_stale_and_overflow() -> None:
    """Remove expired history entries, then trim to a bounded size."""
    now = time.time()

    stale = [
        key
        for key, (cached_at, _) in _history_cache.items()
        if now - cached_at > _CACHE_HARD_TTL_SECONDS
    ]
    for key in stale:
        _history_cache.pop(key, None)
        _history_locks.pop(key, None)

    if len(_history_cache) > _CACHE_MAX_SIZE:
        sorted_keys = sorted(_history_cache, key=lambda key: _history_cache[key][0])
        evict_count = len(_history_cache) - _CACHE_MAX_SIZE // 2
        for key in sorted_keys[:evict_count]:
            _history_cache.pop(key, None)
            _history_locks.pop(key, None)


async def fetch_daily_close_series(
    symbol: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> List[Tuple[date, float]]:
    asset_class = get_symbol_asset_class(symbol)
    return await fetch_alpaca_daily_close_series(
        symbol,
        start=start,
        end=end,
        asset_class=asset_class,
    )


async def get_daily_close_series_cached(
    symbol: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
    min_ttl_seconds: int = 300,
) -> List[Tuple[date, float]]:
    now = time.time()
    asset_class = get_symbol_asset_class(symbol)
    key = _history_cache_key(symbol, asset_class, start, end)

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

        # Evict on write so cleanup stays incremental on the hot path.
        _evict_stale_and_overflow()

        return list(payload)


async def fetch_daily_bar_series(symbol: str) -> List[dict]:
    asset_class = get_symbol_asset_class(symbol)
    return await fetch_daily_bar_rows(symbol, asset_class=asset_class)


def slice_series(series: List[Tuple[date, float]], start: date, end: date) -> List[Tuple[date, float]]:
    return [(point_date, close) for (point_date, close) in series if start <= point_date <= end]
