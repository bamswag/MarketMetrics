from __future__ import annotations

import asyncio
import time
from typing import Dict, Tuple

from app.integrations.alpaca.market_data import fetch_snapshot
from app.services.search import get_symbol_asset_class


_quote_cache: Dict[str, Tuple[float, dict]] = {}
_quote_locks: Dict[str, asyncio.Lock] = {}


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
        return payload
