from __future__ import annotations

import asyncio
import gc
import time
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Union

from app.integrations.alpaca.market_data import (
    fetch_intraday_close_series,
    fetch_snapshots,
    fetch_top_movers,
)
from app.schemas.movers import (
    FeaturedMoverAsset,
    FeaturedMoverDirection,
    FeaturedMoverPeriod,
    FeaturedMoverResponse,
    FeaturedMoverSeriesPoint,
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
    resolve_crypto_pair_name,
)

MOVERS_CACHE_TTL_SECONDS = 45
MOVERS_CACHE_MAX_SIZE = 4
SPARKLINE_LOOKBACK_DAYS = 14
SPARKLINE_POINTS = 5
MOVER_CATEGORY_ORDER = ("stocks", "crypto", "etfs")
FEATURED_MOVER_LOOKBACK_DAYS = {
    FeaturedMoverPeriod.week: 7,
    FeaturedMoverPeriod.month: 30,
}
FEATURED_MOVER_CACHE_TTL_SECONDS = {
    FeaturedMoverPeriod.day: 45,
    FeaturedMoverPeriod.week: 300,
    FeaturedMoverPeriod.month: 300,
}
FEATURED_MOVER_CACHE_MAX_SIZE = 8

_movers_cache: Dict[int, tuple[float, MoversResponse]] = {}
_movers_cache_locks: Dict[int, asyncio.Lock] = {}
_featured_mover_cache: Dict[
    tuple[str, str, str],
    tuple[float, FeaturedMoverResponse],
] = {}
_featured_mover_cache_locks: Dict[
    tuple[str, str, str],
    asyncio.Lock,
] = {}


def _prune_movers_cache(now: Optional[float] = None) -> None:
    current_time = now or time.time()
    evicted = 0

    stale_limits = [
        limit
        for limit, (cached_at, _) in _movers_cache.items()
        if current_time - cached_at > MOVERS_CACHE_TTL_SECONDS
    ]
    for limit in stale_limits:
        _movers_cache.pop(limit, None)
        _movers_cache_locks.pop(limit, None)
        evicted += 1

    if len(_movers_cache) > MOVERS_CACHE_MAX_SIZE:
        sorted_limits = sorted(_movers_cache, key=lambda limit: _movers_cache[limit][0])
        for limit in sorted_limits[: len(_movers_cache) - MOVERS_CACHE_MAX_SIZE]:
            _movers_cache.pop(limit, None)
            _movers_cache_locks.pop(limit, None)
            evicted += 1

    if evicted:
        gc.collect()


def _prune_featured_mover_cache(now: Optional[float] = None) -> None:
    current_time = now or time.time()
    evicted = 0

    stale_keys = [
        key
        for key, (cached_at, payload) in _featured_mover_cache.items()
        if current_time - cached_at
        > FEATURED_MOVER_CACHE_TTL_SECONDS[FeaturedMoverPeriod(payload.period)]
    ]
    for key in stale_keys:
        _featured_mover_cache.pop(key, None)
        _featured_mover_cache_locks.pop(key, None)
        evicted += 1

    if len(_featured_mover_cache) > FEATURED_MOVER_CACHE_MAX_SIZE:
        sorted_keys = sorted(_featured_mover_cache, key=lambda key: _featured_mover_cache[key][0])
        for key in sorted_keys[: len(_featured_mover_cache) - FEATURED_MOVER_CACHE_MAX_SIZE]:
            _featured_mover_cache.pop(key, None)
            _featured_mover_cache_locks.pop(key, None)
            evicted += 1

    if evicted:
        gc.collect()


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


def _to_percent_string(value: float) -> str:
    return f"{value:.2f}%"


def _featured_mover_title(
    period: FeaturedMoverPeriod,
    direction: FeaturedMoverDirection,
    asset: FeaturedMoverAsset,
) -> str:
    asset_prefix = {
        FeaturedMoverAsset.all: "",
        FeaturedMoverAsset.stocks: "stock ",
        FeaturedMoverAsset.crypto: "crypto ",
        FeaturedMoverAsset.etfs: "ETF ",
    }[asset]
    period_suffix = {
        FeaturedMoverPeriod.day: "today",
        FeaturedMoverPeriod.week: "this week",
        FeaturedMoverPeriod.month: "this month",
    }[period]
    return f"Top {asset_prefix}{direction.value} {period_suffix}".strip()


def _categories_for_asset(asset: FeaturedMoverAsset) -> tuple[str, ...]:
    if asset == FeaturedMoverAsset.all:
        return MOVER_CATEGORY_ORDER
    return (asset.value,)


def _build_featured_mover(
    item: Dict[str, Any],
    metadata_map: Dict[str, Dict[str, Any]],
) -> Mover:
    symbol = str(item.get("symbol") or "").strip().upper()
    metadata = metadata_map.get(symbol)
    return Mover(
        symbol=item.get("symbol") or symbol,
        name=_resolve_mover_name(symbol, metadata),
        price=_to_float(item.get("price")),
        change_amount=_to_float(item.get("change_amount")),
        change_percent=item.get("change_percent"),
        volume=_to_int(item.get("volume")),
        sparklineSeries=[],
    )


def _build_featured_series(
    points: Iterable[tuple[Union[date, datetime], float]],
) -> List[FeaturedMoverSeriesPoint]:
    series: List[FeaturedMoverSeriesPoint] = []
    for point_date, close in points:
        timestamp = (
            point_date
            if isinstance(point_date, datetime)
            else datetime.combine(point_date, datetime.min.time())
        )
        series.append(FeaturedMoverSeriesPoint(date=timestamp, close=float(close)))
    return series


async def _rank_period_candidates(
    symbols: List[str],
    *,
    window_days: int,
    direction: FeaturedMoverDirection,
    asset_class_map: Dict[str, str],
) -> List[Dict[str, Any]]:
    if not symbols:
        return []

    snapshots = await fetch_snapshots(symbols, asset_class_map=asset_class_map)
    start_date = date.today() - timedelta(days=window_days - 1)
    semaphore = asyncio.Semaphore(8)

    async def evaluate(symbol: str) -> Optional[Dict[str, Any]]:
        snapshot = snapshots.get(symbol)
        price = _to_float(snapshot.get("price") if snapshot else None)
        if price is None:
            return None

        async with semaphore:
            try:
                history = await get_daily_close_series_cached(
                    symbol,
                    start=start_date,
                    end=date.today(),
                )
            except Exception:
                return None

        if not history:
            return None

        base_close = _to_float(history[0][1])
        if base_close in (None, 0):
            return None

        change_amount = price - base_close
        change_percent_value = (change_amount / base_close) * 100
        if direction == FeaturedMoverDirection.gainer and change_percent_value <= 0:
            return None
        if direction == FeaturedMoverDirection.loser and change_percent_value >= 0:
            return None

        return {
            "symbol": symbol,
            "price": price,
            "change_amount": round(change_amount, 4),
            "change_percent": _to_percent_string(change_percent_value),
            "change_percent_value": change_percent_value,
            "volume": _to_int(snapshot.get("volume") if snapshot else None),
        }

    # Process in batches to avoid creating hundreds of coroutines simultaneously,
    # which causes Python's heap to ratchet up and never release back to the OS.
    _RANK_BATCH_SIZE = 12
    ranked: List[Dict[str, Any]] = []
    for i in range(0, len(symbols), _RANK_BATCH_SIZE):
        batch_results = await asyncio.gather(
            *(evaluate(symbol) for symbol in symbols[i : i + _RANK_BATCH_SIZE])
        )
        ranked.extend(item for item in batch_results if item is not None)

    ranked.sort(
        key=lambda item: item["change_percent_value"],
        reverse=direction == FeaturedMoverDirection.gainer,
    )
    return ranked


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

    # Batch sparkline fetches to keep peak coroutine count bounded.
    _SPARKLINE_BATCH_SIZE = 15
    all_results: List[List[MoverSparklinePoint]] = []
    for i in range(0, len(symbols), _SPARKLINE_BATCH_SIZE):
        batch = symbols[i : i + _SPARKLINE_BATCH_SIZE]
        batch_results = await asyncio.gather(
            *[_build_sparkline_series(symbol) for symbol in batch],
            return_exceptions=False,
        )
        all_results.extend(batch_results)
    return dict(zip(symbols, all_results))


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


def _resolve_mover_name(symbol: str, metadata: Optional[Dict[str, Any]]) -> Optional[str]:
    if metadata and metadata.get("name"):
        return str(metadata["name"])

    if get_symbol_asset_class(symbol) == "crypto":
        return resolve_crypto_pair_name(symbol)

    return None


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
                name=_resolve_mover_name(normalized_symbol, metadata),
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


async def _build_featured_mover_response(
    period: FeaturedMoverPeriod,
    direction: FeaturedMoverDirection,
    asset: FeaturedMoverAsset,
) -> FeaturedMoverResponse:
    mover_universe_by_category = await get_dynamic_mover_universe_symbols_by_category()
    categories = _categories_for_asset(asset)
    symbols = [
        symbol
        for category in categories
        for symbol in mover_universe_by_category.get(category, [])
    ]
    asset_class_map = _build_asset_class_map(symbols)
    title = _featured_mover_title(period, direction, asset)

    featured_item: Optional[Dict[str, Any]] = None
    if period == FeaturedMoverPeriod.day:
        ranked = await fetch_top_movers(
            symbols,
            top_n=1,
            asset_class_map=asset_class_map,
        )
        featured_items = (
            ranked.get("top_gainers")
            if direction == FeaturedMoverDirection.gainer
            else ranked.get("top_losers")
        ) or []
        featured_item = featured_items[0] if featured_items else None
    else:
        window_days = FEATURED_MOVER_LOOKBACK_DAYS[period]
        ranked_items = await _rank_period_candidates(
            symbols,
            window_days=window_days,
            direction=direction,
            asset_class_map=asset_class_map,
        )
        featured_item = ranked_items[0] if ranked_items else None

    if not featured_item:
        return FeaturedMoverResponse(
            period=period,
            direction=direction,
            asset=asset,
            title=title,
            mover=None,
            historicalSeries=[],
            source="alpaca",
        )

    symbol = str(featured_item["symbol"]).strip().upper()
    metadata_map = _build_metadata_map([featured_item])
    asset_class = asset_class_map.get(symbol, get_symbol_asset_class(symbol))

    if period == FeaturedMoverPeriod.day:
        try:
            chart_points = await fetch_intraday_close_series(symbol, asset_class=asset_class)
        except Exception:
            chart_points = []
    else:
        window_days = FEATURED_MOVER_LOOKBACK_DAYS[period]
        try:
            chart_points = await get_daily_close_series_cached(
                symbol,
                start=date.today() - timedelta(days=window_days - 1),
                end=date.today(),
            )
        except Exception:
            chart_points = []

    return FeaturedMoverResponse(
        period=period,
        direction=direction,
        asset=asset,
        title=title,
        mover=_build_featured_mover(featured_item, metadata_map),
        historicalSeries=_build_featured_series(chart_points),
        source="alpaca",
    )


async def get_market_movers(limit: int = 5) -> MoversResponse:
    now = time.time()
    _prune_movers_cache(now)

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
        _prune_movers_cache()
        return payload


async def get_featured_mover(
    *,
    period: FeaturedMoverPeriod,
    direction: FeaturedMoverDirection,
    asset: FeaturedMoverAsset,
) -> FeaturedMoverResponse:
    cache_key = (period.value, direction.value, asset.value)
    cache_ttl = FEATURED_MOVER_CACHE_TTL_SECONDS[period]
    now = time.time()
    _prune_featured_mover_cache(now)

    if cache_key in _featured_mover_cache:
        cached_at, payload = _featured_mover_cache[cache_key]
        if now - cached_at < cache_ttl:
            return payload

    lock = _featured_mover_cache_locks.setdefault(cache_key, asyncio.Lock())
    async with lock:
        now = time.time()
        if cache_key in _featured_mover_cache:
            cached_at, payload = _featured_mover_cache[cache_key]
            if now - cached_at < cache_ttl:
                return payload

        payload = await _build_featured_mover_response(
            period=period,
            direction=direction,
            asset=asset,
        )
        _featured_mover_cache[cache_key] = (time.time(), payload)
        _prune_featured_mover_cache()
        return payload
