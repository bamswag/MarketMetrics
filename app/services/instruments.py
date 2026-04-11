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
from app.services.price_history import get_daily_close_series_cached
from app.services.search import get_symbol_metadata, is_chartable_instrument, resolve_company_name
from app.services.quotes import get_quote_cached


RANGE_WINDOWS_DAYS = {
    InstrumentRange.one_month: 30,
    InstrumentRange.three_months: 90,
    InstrumentRange.six_months: 182,
    InstrumentRange.one_year: 365,
    InstrumentRange.five_years: 365 * 5,
}
INSTRUMENT_DATA_TIMEOUT_SECONDS = 8.0


def resolve_history_window(selected_range: InstrumentRange) -> tuple[date, date]:
    end_date = date.today()
    start_date = end_date - timedelta(days=RANGE_WINDOWS_DAYS[selected_range])
    return start_date, end_date


async def get_instrument_detail(
    symbol: str,
    selected_range: InstrumentRange,
) -> InstrumentDetailResponse:
    normalized_symbol = symbol.strip().upper()
    metadata = get_symbol_metadata(normalized_symbol)
    if not metadata:
        raise ValueError("That instrument is not available in the supported catalog.")
    if not is_chartable_instrument(metadata):
        raise ValueError("That instrument is not currently available for chart loading.")

    start_date, end_date = resolve_history_window(selected_range)

    try:
        latest_quote, historical_series = await asyncio.wait_for(
            asyncio.gather(
                get_quote_cached(normalized_symbol),
                get_daily_close_series_cached(
                    normalized_symbol,
                    start=start_date,
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

    if not historical_series:
        raise ValueError("No historical price data is available for that instrument.")

    return InstrumentDetailResponse(
        symbol=normalized_symbol,
        companyName=resolve_company_name(normalized_symbol),
        exchange=metadata.get("exchange"),
        range=selected_range,
        latestQuote=InstrumentQuoteOut(
            price=float(latest_quote["price"]),
            change=latest_quote.get("change"),
            changePercent=latest_quote.get("changePercent"),
            latestTradingDay=latest_quote.get("latestTradingDay"),
            source=latest_quote.get("source"),
        ),
        historicalSeries=[
            InstrumentPricePoint(date=point_date, close=close)
            for point_date, close in historical_series
        ],
    )
