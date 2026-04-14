from __future__ import annotations

import asyncio
import time
from typing import Dict, Tuple

from app.integrations.alpaca.market_data import fetch_snapshot
from app.services.search import get_symbol_asset_class


_quote_cache: Dict[str, Tuple[float, dict]] = {}
_quote_locks: Dict[str, asyncio.Lock] = {}

# Hard cap on how many symbols we keep cached at once.
# When exceeded, the oldest half is evicted together with their locks.
_CACHE_MAX_SIZE = 300
_CACHE_HARD_TTL_SECONDS = 120  # evict entries older than 2 minutes even if cache is small


def _evict_stale_and_overflow() -> None:
    """Remove entries older than the hard TTL, then trim to max size."""
    now = time.time()

    stale = [k for k, (ts, _) in _quote_cache.items() if now - ts > _CACHE_HARD_TTL_SECONDS]
    for k in stale:
        _quote_cache.pop(k, None)
        _quote_locks.pop(k, None)

    if len(_quote_cache) > _CACHE_MAX_SIZE:
        sorted_keys = sorted(_quote_cache, key=lambda k: _quote_cache[k][0])
        evict_count = len(_quote_cache) - _CACHE_MAX_SIZE // 2
        for k in sorted_keys[:evict_count]:
            _quote_cache.pop(k, None)
            _quote_locks.pop(k, None)


async def fetch_global_quote(symbol: str) -> dict:
    asset_class = get_symbol_asset_class(symbol)
    return await fetch_snapshot(symbol, asset_class=asset_class)


async def get_quote_cached(symbol: str, min_ttl_seconds: int = 15) -> dict:
    now = time.time()
    key = symbol.strip().upper()

    if key in _quote_cache:
        ts, payload = _quote_cache[key]
        if now - ts < min_ttl_seconds:
            return payload

    lock = _quote_locks.setdefault(key, asyncio.Lock())
    async with lock:
        now = time.time()
        if key in _quote_cache:
            ts, payload = _quote_cache[key]
            if now - ts < min_ttl_seconds:
                return payload

        payload = await fetch_global_quote(key)
        _quote_cache[key] = (time.time(), payload)

        # Evict on write so cleanup happens gradually rather than in one big sweep.
        _evict_stale_and_overflow()

        return payload
