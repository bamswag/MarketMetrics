from __future__ import annotations

import asyncio
import gc
import time
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from app.integrations.alpaca.market_data import (
    fetch_daily_bar_rows,
    fetch_earliest_daily_bar_date as fetch_alpaca_earliest_daily_bar_date,
    fetch_daily_close_series as fetch_alpaca_daily_close_series,
)
from app.services.search import get_symbol_asset_class

HistoryCacheKey = Tuple[str, str, Optional[str], Optional[str]]
EarliestDateCacheKey = Tuple[str, str, Optional[str]]

_history_cache: Dict[HistoryCacheKey, Tuple[float, List[Tuple[date, float]]]] = {}
_history_locks: Dict[HistoryCacheKey, asyncio.Lock] = {}
_bar_history_cache: Dict[HistoryCacheKey, Tuple[float, List[Dict[str, Any]]]] = {}
_bar_history_locks: Dict[HistoryCacheKey, asyncio.Lock] = {}
_earliest_date_cache: Dict[EarliestDateCacheKey, Tuple[float, date]] = {}
_earliest_date_locks: Dict[EarliestDateCacheKey, asyncio.Lock] = {}

# Historical series can be much larger than quote snapshots, so keep this cache
# intentionally smaller and short-lived to avoid steady process growth.
_CACHE_MAX_SIZE = 48
_BAR_CACHE_MAX_SIZE = 32
_CACHE_HARD_TTL_SECONDS = 300
_EARLIEST_DATE_CACHE_MAX_SIZE = 96
_EARLIEST_DATE_CACHE_HARD_TTL_SECONDS = 6 * 60 * 60
_FULL_HISTORY_LOOKBACK_START = date(1970, 1, 1)


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


def _earliest_date_cache_key(
    symbol: str,
    asset_class: str,
    end: Optional[date],
) -> EarliestDateCacheKey:
    return (
        symbol.strip().upper(),
        asset_class,
        end.isoformat() if end else None,
    )


def _evict_stale_and_overflow() -> None:
    """Remove expired history entries, then trim to a bounded size."""
    now = time.time()
    evicted = 0

    stale = [
        key
        for key, (cached_at, _) in _history_cache.items()
        if now - cached_at > _CACHE_HARD_TTL_SECONDS
    ]
    for key in stale:
        _history_cache.pop(key, None)
        _history_locks.pop(key, None)
        evicted += 1

    if len(_history_cache) > _CACHE_MAX_SIZE:
        sorted_keys = sorted(_history_cache, key=lambda key: _history_cache[key][0])
        evict_count = len(_history_cache) - _CACHE_MAX_SIZE // 2
        for key in sorted_keys[:evict_count]:
            _history_cache.pop(key, None)
            _history_locks.pop(key, None)
            evicted += 1

    if evicted:
        gc.collect()


def _evict_stale_and_overflow_bars() -> None:
    now = time.time()
    evicted = 0

    stale = [
        key
        for key, (cached_at, _) in _bar_history_cache.items()
        if now - cached_at > _CACHE_HARD_TTL_SECONDS
    ]
    for key in stale:
        _bar_history_cache.pop(key, None)
        _bar_history_locks.pop(key, None)
        evicted += 1

    if len(_bar_history_cache) > _BAR_CACHE_MAX_SIZE:
        sorted_keys = sorted(_bar_history_cache, key=lambda key: _bar_history_cache[key][0])
        evict_count = len(_bar_history_cache) - _BAR_CACHE_MAX_SIZE // 2
        for key in sorted_keys[:evict_count]:
            _bar_history_cache.pop(key, None)
            _bar_history_locks.pop(key, None)
            evicted += 1

    if evicted:
        gc.collect()


def _evict_stale_and_overflow_earliest_dates() -> None:
    now = time.time()
    evicted = 0

    stale = [
        key
        for key, (cached_at, _) in _earliest_date_cache.items()
        if now - cached_at > _EARLIEST_DATE_CACHE_HARD_TTL_SECONDS
    ]
    for key in stale:
        _earliest_date_cache.pop(key, None)
        _earliest_date_locks.pop(key, None)
        evicted += 1

    if len(_earliest_date_cache) > _EARLIEST_DATE_CACHE_MAX_SIZE:
        sorted_keys = sorted(
            _earliest_date_cache,
            key=lambda key: _earliest_date_cache[key][0],
        )
        evict_count = len(_earliest_date_cache) - _EARLIEST_DATE_CACHE_MAX_SIZE // 2
        for key in sorted_keys[:evict_count]:
            _earliest_date_cache.pop(key, None)
            _earliest_date_locks.pop(key, None)
            evicted += 1

    if evicted:
        gc.collect()


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


async def fetch_earliest_available_close_date(
    symbol: str,
    *,
    end: Optional[date] = None,
) -> date:
    asset_class = get_symbol_asset_class(symbol)
    return await fetch_alpaca_earliest_daily_bar_date(
        symbol,
        start=_FULL_HISTORY_LOOKBACK_START,
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


async def get_daily_bar_series_cached(
    symbol: str,
    *,
    start: Optional[date] = None,
    end: Optional[date] = None,
    min_ttl_seconds: int = 300,
) -> List[Dict[str, Any]]:
    now = time.time()
    asset_class = get_symbol_asset_class(symbol)
    key = _history_cache_key(symbol, asset_class, start, end)

    if key in _bar_history_cache:
        cached_at, payload = _bar_history_cache[key]
        if now - cached_at < min_ttl_seconds:
            return [dict(row) for row in payload]

    lock = _bar_history_locks.setdefault(key, asyncio.Lock())
    async with lock:
        now = time.time()
        if key in _bar_history_cache:
            cached_at, payload = _bar_history_cache[key]
            if now - cached_at < min_ttl_seconds:
                return [dict(row) for row in payload]

        payload = await fetch_daily_bar_rows(
            symbol,
            start=start,
            end=end,
            asset_class=asset_class,
        )
        _bar_history_cache[key] = (time.time(), payload)
        _evict_stale_and_overflow_bars()
        return [dict(row) for row in payload]


async def get_earliest_available_close_date_cached(
    symbol: str,
    *,
    end: Optional[date] = None,
    min_ttl_seconds: int = 60 * 60,
) -> date:
    now = time.time()
    asset_class = get_symbol_asset_class(symbol)
    key = _earliest_date_cache_key(symbol, asset_class, end)

    if key in _earliest_date_cache:
        cached_at, payload = _earliest_date_cache[key]
        if now - cached_at < min_ttl_seconds:
            return payload

    lock = _earliest_date_locks.setdefault(key, asyncio.Lock())
    async with lock:
        now = time.time()
        if key in _earliest_date_cache:
            cached_at, payload = _earliest_date_cache[key]
            if now - cached_at < min_ttl_seconds:
                return payload

        payload = await fetch_earliest_available_close_date(symbol, end=end)
        _earliest_date_cache[key] = (time.time(), payload)
        _evict_stale_and_overflow_earliest_dates()
        return payload


async def fetch_daily_bar_series(symbol: str) -> List[dict]:
    asset_class = get_symbol_asset_class(symbol)
    return await fetch_daily_bar_rows(symbol, asset_class=asset_class)


def slice_series(series: List[Tuple[date, float]], start: date, end: date) -> List[Tuple[date, float]]:
    return [(point_date, close) for (point_date, close) in series if start <= point_date <= end]
