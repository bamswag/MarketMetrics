from __future__ import annotations

import asyncio
from datetime import date, timedelta

from app.integrations.alpaca.client import AlpacaMarketDataError
from app.schemas.instruments import (
    InstrumentDetailResponse,
    InstrumentPricePoint,
    InstrumentQuoteOut,
    InstrumentRange,
)
from app.services.price_history import (
    get_daily_close_series_cached,
    get_earliest_available_close_date_cached,
)
from app.services.search import (
    get_symbol_asset_class,
    get_symbol_metadata,
    is_chartable_instrument,
    normalize_catalog_symbol,
    resolve_company_name,
)
from app.services.quotes import get_quote_cached


RANGE_WINDOWS_DAYS = {
    InstrumentRange.one_week: 7,
    InstrumentRange.one_month: 30,
    InstrumentRange.three_months: 90,
    InstrumentRange.six_months: 182,
    InstrumentRange.one_year: 365,
    InstrumentRange.five_years: 365 * 5,
}
INSTRUMENT_DATA_TIMEOUT_SECONDS = 8.0
STANDARD_RANGE_ORDER = [
    InstrumentRange.one_week,
    InstrumentRange.one_month,
    InstrumentRange.three_months,
    InstrumentRange.six_months,
    InstrumentRange.one_year,
    InstrumentRange.five_years,
]


def resolve_history_window(selected_range: InstrumentRange) -> tuple[date | None, date]:
    end_date = date.today()
    if selected_range == InstrumentRange.max_range:
        return None, end_date

    start_date = end_date - timedelta(days=RANGE_WINDOWS_DAYS[selected_range])
    return start_date, end_date


def determine_available_ranges(
    earliest_available_date: date,
    *,
    end_date: date,
) -> list[InstrumentRange]:
    available_ranges: list[InstrumentRange] = []

    for range_option in STANDARD_RANGE_ORDER:
        range_start = end_date - timedelta(days=RANGE_WINDOWS_DAYS[range_option])
        if earliest_available_date <= range_start:
            available_ranges.append(range_option)

    available_ranges.append(InstrumentRange.max_range)
    return available_ranges


def resolve_effective_range(
    requested_range: InstrumentRange,
    available_ranges: list[InstrumentRange],
) -> InstrumentRange:
    if requested_range in available_ranges:
        return requested_range

    if InstrumentRange.max_range in available_ranges:
        return InstrumentRange.max_range

    if available_ranges:
        return available_ranges[-1]

    return requested_range


async def get_instrument_detail(
    symbol: str,
    selected_range: InstrumentRange,
) -> InstrumentDetailResponse:
    asset_class = get_symbol_asset_class(symbol)
    normalized_symbol = normalize_catalog_symbol(symbol, asset_class)
    metadata = get_symbol_metadata(normalized_symbol)
    if not metadata:
        raise ValueError("That instrument is not available in the supported catalog.")
    if not is_chartable_instrument(metadata):
        raise ValueError("That instrument is not currently available for chart loading.")

    canonical_symbol = metadata.get("symbol") or normalized_symbol

    # ── Daily ranges (1W, 1M, 3M, 6M, 1Y, 5Y, MAX) ───────────────────────────
    _, end_date = resolve_history_window(selected_range)

    try:
        latest_quote, earliest_available_date = await asyncio.wait_for(
            asyncio.gather(
                get_quote_cached(canonical_symbol),
                get_earliest_available_close_date_cached(
                    canonical_symbol,
                    end=end_date,
                ),
            ),
            timeout=INSTRUMENT_DATA_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise AlpacaMarketDataError(
            "Timed out while loading market data for that instrument. Please try again."
        ) from exc
    except AlpacaMarketDataError:
        raise

    available_ranges = determine_available_ranges(
        earliest_available_date,
        end_date=end_date,
    )
    effective_range = resolve_effective_range(selected_range, available_ranges)
    effective_start_date, effective_end_date = resolve_history_window(effective_range)

    try:
        historical_series = await asyncio.wait_for(
            get_daily_close_series_cached(
                canonical_symbol,
                start=earliest_available_date if effective_start_date is None else effective_start_date,
                end=effective_end_date,
            ),
            timeout=INSTRUMENT_DATA_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise AlpacaMarketDataError(
            "Timed out while loading market data for that instrument. Please try again."
        ) from exc
    except AlpacaMarketDataError:
        raise

    if not historical_series:
        raise ValueError("No historical price data is available for that instrument.")

    return InstrumentDetailResponse(
        symbol=canonical_symbol,
        companyName=resolve_company_name(canonical_symbol),
        assetCategory=metadata.get("assetCategory"),
        exchange=metadata.get("exchange"),
        range=effective_range,
        availableRanges=available_ranges,
        earliestAvailableDate=earliest_available_date,
        latestQuote=InstrumentQuoteOut(
            price=float(latest_quote["price"]),
            change=latest_quote.get("change"),
            changePercent=latest_quote.get("changePercent"),
            latestTradingDay=latest_quote.get("latestTradingDay"),
            source=latest_quote.get("source"),
        ),
        historicalSeries=[
            InstrumentPricePoint(date=point_date.isoformat(), close=close)
            for point_date, close in historical_series
        ],
    )
