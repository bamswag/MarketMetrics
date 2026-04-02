from __future__ import annotations

import asyncio
import time
from typing import Dict, Tuple

import httpx

from app.services.alpha_vantage import BASE_URL, _get_api_key, AlphaVantageError


# Simple in-memory cache to reduce rate-limit risk
# symbol -> (timestamp, payload)
_quote_cache: Dict[str, Tuple[float, dict]] = {}
# symbol -> lock guarding upstream fetches for that symbol
_quote_locks: Dict[str, asyncio.Lock] = {}


async def fetch_global_quote(symbol: str) -> dict:
    """
    Fetches the latest quote for symbol from Alpha Vantage GLOBAL_QUOTE.
    Returns a normalized dict.
    """
    symbol = symbol.strip().upper()

    params = {
        "function": "GLOBAL_QUOTE",
        "symbol": symbol,
        "apikey": _get_api_key(),
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(BASE_URL, params=params)

    if resp.status_code != 200:
        raise AlphaVantageError(f"Alpha Vantage HTTP {resp.status_code}")

    data = resp.json()

    if "Error Message" in data:
        raise AlphaVantageError(data["Error Message"])
    if "Information" in data:
        raise AlphaVantageError(data["Information"])
    if "Note" in data:
        raise AlphaVantageError(data["Note"])

    q = data.get("Global Quote") or {}
    # AV keys look like "05. price"
    price = q.get("05. price")
    change = q.get("09. change")
    change_pct = q.get("10. change percent")
    volume = q.get("06. volume")
    latest_day = q.get("07. latest trading day")

    if not price:
        raise AlphaVantageError("GLOBAL_QUOTE returned no price (symbol may be invalid or rate-limited).")

    return {
        "symbol": symbol,
        "price": float(price),
        "change": float(change) if change else None,
        "changePercent": change_pct,
        "volume": int(volume) if volume else None,
        "latestTradingDay": latest_day,
        "source": "alpha_vantage",
    }


async def get_quote_cached(symbol: str, min_ttl_seconds: int = 15) -> dict:
    """
    Returns cached quote if it was fetched recently.
    Prevents hammering Alpha Vantage when many clients subscribe.
    """
    now = time.time()
    key = symbol.strip().upper()

    if key in _quote_cache:
        ts, payload = _quote_cache[key]
        if now - ts < min_ttl_seconds:
            return payload

    lock = _quote_locks.setdefault(key, asyncio.Lock())
    async with lock:
        # Re-check cache after waiting for any in-flight fetch for this symbol.
        now = time.time()
        if key in _quote_cache:
            ts, payload = _quote_cache[key]
            if now - ts < min_ttl_seconds:
                return payload

        payload = await fetch_global_quote(key)
        _quote_cache[key] = (time.time(), payload)
        return payload
