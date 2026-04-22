from __future__ import annotations

import asyncio
import time
from typing import Dict, Iterable, List, Optional, Tuple

from app.integrations.alpaca.market_data import fetch_snapshot, fetch_snapshots
from app.schemas.quotes import PublicQuoteOut
from app.services.search import (
    get_symbol_asset_class,
    get_symbol_metadata,
    is_chartable_instrument,
    normalize_catalog_symbol,
)


_quote_cache: Dict[str, Tuple[float, dict]] = {}
_quote_locks: Dict[str, asyncio.Lock] = {}

# Hard cap on how many symbols we keep cached at once.
# When exceeded, the oldest half is evicted together with their locks.
_CACHE_MAX_SIZE = 300
_CACHE_HARD_TTL_SECONDS = 120  # evict entries older than 2 minutes even if cache is small


def _quote_cache_key(symbol: str) -> str:
    return symbol.strip().upper()


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
    key = _quote_cache_key(symbol)

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


def _public_quote_from_snapshot(
    symbol: str,
    snapshot: Optional[dict],
    unavailable_reason: Optional[str] = None,
) -> PublicQuoteOut:
    if not snapshot or snapshot.get("price") is None:
        return PublicQuoteOut(
            symbol=symbol,
            unavailableReason=unavailable_reason or "No quote data available.",
        )

    return PublicQuoteOut(
        symbol=symbol,
        price=snapshot.get("price"),
        change=snapshot.get("change"),
        changePercent=snapshot.get("changePercent"),
        latestTradingDay=snapshot.get("latestTradingDay"),
        source=snapshot.get("source"),
    )


def _resolve_public_quote_symbol(raw_symbol: str) -> tuple[str, Optional[str]]:
    asset_class = get_symbol_asset_class(raw_symbol)
    normalized_symbol = normalize_catalog_symbol(raw_symbol, asset_class)
    metadata = get_symbol_metadata(normalized_symbol)

    if not metadata:
        return normalized_symbol, "That instrument is not available in the supported catalog."

    if not is_chartable_instrument(metadata):
        return normalized_symbol, "That instrument is not currently available for market quotes."

    return metadata.get("symbol") or normalized_symbol, None


async def get_public_quotes_cached(
    symbols: Iterable[str],
    *,
    min_ttl_seconds: int = 15,
) -> List[PublicQuoteOut]:
    """Return lightweight public quotes without loading historical chart data."""
    now = time.time()
    requested_symbols: List[str] = []
    canonical_by_requested: Dict[str, str] = {}
    unavailable_by_requested: Dict[str, str] = {}
    asset_class_map: Dict[str, str] = {}

    for raw_symbol in symbols:
        raw_symbol = raw_symbol.strip()
        if not raw_symbol:
            continue

        canonical_symbol, unavailable_reason = _resolve_public_quote_symbol(raw_symbol)
        requested_key = _quote_cache_key(canonical_symbol)
        if requested_key in canonical_by_requested:
            continue

        requested_symbols.append(canonical_symbol)
        canonical_by_requested[requested_key] = canonical_symbol

        if unavailable_reason:
            unavailable_by_requested[requested_key] = unavailable_reason
            continue

        asset_class_map[requested_key] = get_symbol_asset_class(canonical_symbol)

    symbols_to_fetch: List[str] = []
    for requested_key, canonical_symbol in canonical_by_requested.items():
        if requested_key in unavailable_by_requested:
            continue

        cached = _quote_cache.get(requested_key)
        if cached and now - cached[0] < min_ttl_seconds:
            continue

        symbols_to_fetch.append(canonical_symbol)

    if symbols_to_fetch:
        snapshots = await fetch_snapshots(
            symbols_to_fetch,
            asset_class_map=asset_class_map,
        )

        for canonical_symbol in symbols_to_fetch:
            key = _quote_cache_key(canonical_symbol)
            snapshot = snapshots.get(key)
            if snapshot and snapshot.get("price") is not None:
                _quote_cache[key] = (time.time(), snapshot)

        _evict_stale_and_overflow()

    quotes: List[PublicQuoteOut] = []
    for canonical_symbol in requested_symbols:
        key = _quote_cache_key(canonical_symbol)
        if key in unavailable_by_requested:
            quotes.append(
                _public_quote_from_snapshot(
                    canonical_symbol,
                    None,
                    unavailable_by_requested[key],
                )
            )
            continue

        cached = _quote_cache.get(key)
        quotes.append(
            _public_quote_from_snapshot(
                canonical_symbol,
                cached[1] if cached else None,
            )
        )

    return quotes
