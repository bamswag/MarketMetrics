from __future__ import annotations

import math
import time
from datetime import date, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

from app.integrations.alpaca.market_data import fetch_daily_close_series_batch
from app.schemas.instruments import ChartReadinessMetadata, InstrumentRange
from app.services.search import get_symbol_asset_class, get_symbol_metadata, is_chartable_instrument


RANGE_DAYS = {
    InstrumentRange.one_week: 7,
    InstrumentRange.one_month: 30,
    InstrumentRange.three_months: 90,
    InstrumentRange.six_months: 182,
    InstrumentRange.one_year: 365,
    InstrumentRange.five_years: 365 * 5,
}
RANGE_MINIMUM_POINTS = {
    InstrumentRange.one_week: 2,
    InstrumentRange.one_month: 5,
    InstrumentRange.three_months: 15,
    InstrumentRange.six_months: 30,
    InstrumentRange.one_year: 60,
    InstrumentRange.five_years: 252,
    InstrumentRange.max_range: 5,
}
RANGE_ORDER = [
    InstrumentRange.one_week,
    InstrumentRange.one_month,
    InstrumentRange.three_months,
    InstrumentRange.six_months,
    InstrumentRange.one_year,
    InstrumentRange.five_years,
]
READINESS_LOOKBACK_DAYS = 182
READINESS_SUCCESS_TTL_SECONDS = 6 * 60 * 60
READINESS_FAILURE_TTL_SECONDS = 15 * 60
READINESS_CACHE_MAX_SIZE = 512

ReadinessCacheKey = Tuple[str, str, str]
_readiness_cache: Dict[ReadinessCacheKey, Tuple[float, ChartReadinessMetadata]] = {}


def _valid_points(points: Iterable[Tuple[date, float]]) -> List[Tuple[date, float]]:
    by_date: Dict[date, float] = {}
    for point_date, raw_close in points:
        try:
            close = float(raw_close)
        except (TypeError, ValueError):
            continue
        if math.isfinite(close) and close > 0:
            by_date[point_date] = close
    return sorted(by_date.items(), key=lambda point: point[0])


def classify_history_readiness(
    symbol: str,
    points: Iterable[Tuple[date, float]],
    *,
    end_date: Optional[date] = None,
) -> ChartReadinessMetadata:
    end = end_date or date.today()
    metadata = get_symbol_metadata(symbol)
    if not is_chartable_instrument(metadata):
        return ChartReadinessMetadata(unavailableReason="Instrument is not active and tradable.")

    valid = _valid_points(points)
    if len(valid) < 5:
        return ChartReadinessMetadata(
            historyPointCount=len(valid),
            historyStart=valid[0][0].isoformat() if valid else None,
            historyEnd=valid[-1][0].isoformat() if valid else None,
            unavailableReason="Not enough historical prices are available yet.",
        )
    if len({round(close, 12) for _, close in valid}) < 2:
        return ChartReadinessMetadata(
            historyPointCount=len(valid),
            historyStart=valid[0][0].isoformat(),
            historyEnd=valid[-1][0].isoformat(),
            unavailableReason="Historical prices do not contain a usable price range.",
        )

    available: List[InstrumentRange] = []
    for range_value in RANGE_ORDER:
        start = end - timedelta(days=RANGE_DAYS[range_value])
        range_points = [(d, close) for d, close in valid if d >= start]
        coverage_tolerance = 3 if get_symbol_asset_class(symbol) == "crypto" else 7
        covers_range = bool(range_points) and range_points[0][0] <= start + timedelta(days=coverage_tolerance)
        if covers_range and len(range_points) >= RANGE_MINIMUM_POINTS[range_value]:
            available.append(range_value)

    available.append(InstrumentRange.max_range)
    default_range = available[-2] if len(available) > 1 else InstrumentRange.max_range
    return ChartReadinessMetadata(
        chartReady=True,
        availableRanges=available,
        defaultRange=default_range,
        historyPointCount=len(valid),
        historyStart=valid[0][0].isoformat(),
        historyEnd=valid[-1][0].isoformat(),
    )


def _cache_key(symbol: str, end_date: date) -> ReadinessCacheKey:
    normalized = symbol.strip().upper()
    return normalized, get_symbol_asset_class(normalized), end_date.isoformat()


def _prune_cache() -> None:
    if len(_readiness_cache) <= READINESS_CACHE_MAX_SIZE:
        return
    oldest = sorted(_readiness_cache, key=lambda key: _readiness_cache[key][0])
    for key in oldest[: len(_readiness_cache) - READINESS_CACHE_MAX_SIZE // 2]:
        _readiness_cache.pop(key, None)


async def get_chart_readiness_batch(
    symbols: Iterable[str],
    *,
    end_date: Optional[date] = None,
) -> Dict[str, ChartReadinessMetadata]:
    end = end_date or date.today()
    normalized = list(dict.fromkeys(symbol.strip().upper() for symbol in symbols if symbol.strip()))
    result: Dict[str, ChartReadinessMetadata] = {}
    missing: List[str] = []
    now = time.time()
    for symbol in normalized:
        cached = _readiness_cache.get(_cache_key(symbol, end))
        if cached:
            cached_at, readiness = cached
            ttl = READINESS_SUCCESS_TTL_SECONDS if readiness.chartReady else READINESS_FAILURE_TTL_SECONDS
            if now - cached_at < ttl:
                result[symbol] = readiness.model_copy(deep=True)
                continue
        missing.append(symbol)

    if missing:
        asset_class_map = {symbol: get_symbol_asset_class(symbol) for symbol in missing}
        try:
            history_map = await fetch_daily_close_series_batch(
                missing,
                start=end - timedelta(days=READINESS_LOOKBACK_DAYS),
                end=end,
                asset_class_map=asset_class_map,
            )
        except Exception:
            history_map = {}
        for symbol in missing:
            readiness = classify_history_readiness(symbol, history_map.get(symbol, []), end_date=end)
            result[symbol] = readiness
            _readiness_cache[_cache_key(symbol, end)] = (time.time(), readiness.model_copy(deep=True))
        _prune_cache()

    return result
