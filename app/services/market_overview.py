from __future__ import annotations

import asyncio
import time
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from app.integrations.alpaca.market_data import fetch_top_movers
from app.schemas.movers import (
    Mover,
    MoverCategoryBuckets,
    MoversResponse,
    MoverSparklinePoint,
)
from app.services.price_history import get_daily_close_series_cached
from app.services.search import (
    get_dynamic_mover_universe_symbols_by_category,
    get_symbol_asset_class,
    get_symbol_metadata,
)

MOVERS_CACHE_TTL_SECONDS = 45
SPARKLINE_LOOKBACK_DAYS = 14
SPARKLINE_POINTS = 5
MOVER_CATEGORY_ORDER = ("stocks", "crypto", "etfs")

_movers_cache: Dict[int, tuple[float, MoversResponse]] = {}
_movers_cache_locks: Dict[int, asyncio.Lock] = {}


def _to_float(value: Any) -> Optional[float]:
    try:
        return float(str(value).replace("%", ""))
    except Exception:
        return None


def _to_int(value: Any) -> Optional[int]:
    try:
        return int(float(value))
    except Exception:
        return None


async def _build_sparkline_series(symbol: str) -> List[MoverSparklinePoint]:
    end_date = date.today()
    start_date = end_date - timedelta(days=SPARKLINE_LOOKBACK_DAYS)

    try:
        history = await get_daily_close_series_cached(
            symbol,
            start=start_date,
            end=end_date,
        )
    except Exception:
        return []

    return [
        MoverSparklinePoint(date=point_date, close=close)
        for point_date, close in history[-SPARKLINE_POINTS:]
    ]


async def _load_sparkline_map(items: List[Dict[str, Any]]) -> Dict[str, List[MoverSparklinePoint]]:
    seen: set[str] = set()
    symbols: List[str] = []
    for item in items:
        symbol = str(item.get("symbol") or "").strip().upper()
        if symbol and symbol not in seen:
            seen.add(symbol)
            symbols.append(symbol)

    sparkline_results = await asyncio.gather(
        *[_build_sparkline_series(symbol) for symbol in symbols],
        return_exceptions=False,
    )
    return dict(zip(symbols, sparkline_results))


def _build_metadata_map(items: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    metadata_map: Dict[str, Dict[str, Any]] = {}
    for item in items:
        symbol = str(item.get("symbol") or "").strip().upper()
        if not symbol or symbol in metadata_map:
            continue
        metadata = get_symbol_metadata(symbol)
        if metadata:
            metadata_map[symbol] = metadata
    return metadata_map


def _parse_movers(
    items: List[Dict[str, Any]],
    sparkline_map: Dict[str, List[MoverSparklinePoint]],
    metadata_map: Dict[str, Dict[str, Any]],
) -> List[Mover]:
    result: List[Mover] = []
    for item in items:
        symbol = item.get("symbol") or ""
        normalized_symbol = str(symbol).upper()
        metadata = metadata_map.get(normalized_symbol)
        result.append(
            Mover(
                symbol=symbol,
                name=metadata.get("name") if metadata else None,
                price=_to_float(item.get("price")),
                change_amount=_to_float(item.get("change_amount")),
                change_percent=item.get("change_percent"),
                volume=_to_int(item.get("volume")),
                sparklineSeries=sparkline_map.get(normalized_symbol, []),
            )
        )
    return [mover for mover in result if mover.symbol]


def _build_asset_class_map(symbols: List[str]) -> Dict[str, str]:
    return {
        symbol.strip().upper(): get_symbol_asset_class(symbol)
        for symbol in symbols
        if symbol
    }


def _sort_mover_items(items: List[Dict[str, Any]], *, descending: bool) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: _to_float(item.get("change_percent")) or 0.0,
        reverse=descending,
    )


def _merge_category_rankings(
    category_results: Dict[str, Dict[str, List[Dict[str, Any]]]],
    result_key: str,
    *,
    limit: int,
) -> List[Dict[str, Any]]:
    merged_items: List[Dict[str, Any]] = []
    for category in MOVER_CATEGORY_ORDER:
        merged_items.extend(category_results.get(category, {}).get(result_key) or [])

    return _sort_mover_items(
        merged_items,
        descending=result_key == "top_gainers",
    )[:limit]


def _build_category_buckets(
    category_results: Dict[str, Dict[str, List[Dict[str, Any]]]],
    result_key: str,
    sparkline_map: Dict[str, List[MoverSparklinePoint]],
    metadata_map: Dict[str, Dict[str, Any]],
) -> MoverCategoryBuckets:
    return MoverCategoryBuckets(
        stocks=_parse_movers(
            category_results.get("stocks", {}).get(result_key) or [],
            sparkline_map,
            metadata_map,
        ),
        crypto=_parse_movers(
            category_results.get("crypto", {}).get(result_key) or [],
            sparkline_map,
            metadata_map,
        ),
        etfs=_parse_movers(
            category_results.get("etfs", {}).get(result_key) or [],
            sparkline_map,
            metadata_map,
        ),
    )


async def _build_market_movers(limit: int) -> MoversResponse:
    mover_universe_by_category = await get_dynamic_mover_universe_symbols_by_category()
    mover_universe = [
        symbol
        for category in MOVER_CATEGORY_ORDER
        for symbol in mover_universe_by_category.get(category, [])
    ]
    asset_class_map = _build_asset_class_map(mover_universe)
    category_results_list = await asyncio.gather(
        *[
            fetch_top_movers(
                mover_universe_by_category.get(category, []),
                top_n=limit,
                asset_class_map=asset_class_map,
            )
            for category in MOVER_CATEGORY_ORDER
        ],
        return_exceptions=False,
    )
    category_results = dict(zip(MOVER_CATEGORY_ORDER, category_results_list))

    overall_gainers = _merge_category_rankings(category_results, "top_gainers", limit=limit)
    overall_losers = _merge_category_rankings(category_results, "top_losers", limit=limit)
    mover_items = [
        *overall_gainers,
        *overall_losers,
        *[
            item
            for category in MOVER_CATEGORY_ORDER
            for result_key in ("top_gainers", "top_losers")
            for item in category_results.get(category, {}).get(result_key) or []
        ],
    ]
    sparkline_map = await _load_sparkline_map(mover_items)
    metadata_map = _build_metadata_map(mover_items)

    return MoversResponse(
        gainers=_parse_movers(overall_gainers, sparkline_map, metadata_map),
        losers=_parse_movers(overall_losers, sparkline_map, metadata_map),
        gainersByCategory=_build_category_buckets(
            category_results,
            "top_gainers",
            sparkline_map,
            metadata_map,
        ),
        losersByCategory=_build_category_buckets(
            category_results,
            "top_losers",
            sparkline_map,
            metadata_map,
        ),
        source="alpaca",
    )


async def get_market_movers(limit: int = 5) -> MoversResponse:
    now = time.time()

    if limit in _movers_cache:
        cached_at, payload = _movers_cache[limit]
        if now - cached_at < MOVERS_CACHE_TTL_SECONDS:
            return payload

    lock = _movers_cache_locks.setdefault(limit, asyncio.Lock())
    async with lock:
        now = time.time()
        if limit in _movers_cache:
            cached_at, payload = _movers_cache[limit]
            if now - cached_at < MOVERS_CACHE_TTL_SECONDS:
                return payload

        payload = await _build_market_movers(limit)
        _movers_cache[limit] = (time.time(), payload)
        return payload
