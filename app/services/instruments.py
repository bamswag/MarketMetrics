from __future__ import annotations

import asyncio
import re
from datetime import date, timedelta

from app.integrations.alpaca.client import AlpacaMarketDataError
from app.schemas.instruments import (
    InstrumentDetailResponse,
    InstrumentPricePoint,
    InstrumentQuoteOut,
    InstrumentRange,
    SimilarInstrumentOut,
    SimilarInstrumentsResponse,
)
from app.services.price_history import (
    get_daily_bar_series_cached,
    get_earliest_available_close_date_cached,
)
from app.services.search import (
    build_search_result,
    get_symbol_asset_class,
    get_symbol_market_category,
    get_symbol_metadata,
    is_chartable_instrument,
    load_symbol_catalog,
    load_training_universe_manifest,
    normalize_catalog_symbol,
    resolve_company_name,
)
from app.services.quotes import get_public_quotes_cached, get_quote_cached


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
SIMILAR_INSTRUMENT_LIMIT_MAX = 12
_SIMILARITY_STOPWORDS = {
    "a",
    "adr",
    "ads",
    "and",
    "class",
    "common",
    "company",
    "corp",
    "corporation",
    "depositary",
    "etf",
    "fund",
    "group",
    "holdings",
    "inc",
    "income",
    "index",
    "international",
    "limited",
    "ltd",
    "plc",
    "shares",
    "stock",
    "the",
    "trust",
    "usd",
}
_ETF_FAMILY_TOKENS = {
    "advisor",
    "advisorshares",
    "ark",
    "blackrock",
    "defiance",
    "direxion",
    "fidelity",
    "first",
    "franklin",
    "global",
    "invesco",
    "ishares",
    "jpmorgan",
    "proshares",
    "schwab",
    "spdr",
    "vaneck",
    "vanguard",
    "wisdomtree",
}
_CURATED_STOCK_PEERS: dict[str, dict[str, str]] = {
    "WMT": {
        "COST": "Warehouse retail peer",
        "TGT": "Big-box retail peer",
        "KR": "Grocery retail peer",
        "DG": "Discount retail peer",
        "DLTR": "Discount retail peer",
        "AMZN": "Retail and ecommerce peer",
        "HD": "Large consumer retail peer",
        "LOW": "Home improvement retail peer",
    },
    "COST": {
        "WMT": "Warehouse retail peer",
        "TGT": "Big-box retail peer",
        "KR": "Grocery retail peer",
    },
    "TGT": {
        "WMT": "Big-box retail peer",
        "COST": "Big-box retail peer",
        "KR": "Consumer staples retail peer",
    },
    "HD": {
        "LOW": "Home improvement retail peer",
        "WMT": "Large consumer retail peer",
        "COST": "Large consumer retail peer",
    },
    "LOW": {
        "HD": "Home improvement retail peer",
        "WMT": "Large consumer retail peer",
        "COST": "Large consumer retail peer",
    },
}


def _quote_out(latest_quote: dict) -> InstrumentQuoteOut:
    return InstrumentQuoteOut(
        price=float(latest_quote["price"]),
        change=latest_quote.get("change"),
        changePercent=latest_quote.get("changePercent"),
        open=latest_quote.get("open"),
        high=latest_quote.get("high"),
        low=latest_quote.get("low"),
        close=latest_quote.get("close"),
        previousClose=latest_quote.get("previousClose"),
        volume=latest_quote.get("volume"),
        vwap=latest_quote.get("vwap"),
        tradeCount=latest_quote.get("tradeCount"),
        latestTradingDay=latest_quote.get("latestTradingDay"),
        source=latest_quote.get("source"),
    )


def _price_point_from_bar(row: dict) -> InstrumentPricePoint:
    return InstrumentPricePoint(
        date=row["date"].isoformat(),
        open=row.get("open"),
        high=row.get("high"),
        low=row.get("low"),
        close=float(row["close"]),
        volume=row.get("volume"),
        vwap=row.get("vwap"),
        tradeCount=row.get("trade_count"),
    )


def _meaningful_name_tokens(name: str) -> set[str]:
    tokens = {
        token.lower()
        for token in re.findall(r"[A-Za-z0-9]+", name)
        if len(token) >= 3
    }
    return {token for token in tokens if token not in _SIMILARITY_STOPWORDS}


def _crypto_parts(symbol: str) -> tuple[str | None, str | None]:
    normalized = normalize_catalog_symbol(symbol, "crypto")
    if "/" not in normalized:
        return None, None
    base, quote = normalized.split("/", 1)
    return base or None, quote or None


def _training_universe_groups() -> dict[str, str]:
    groups: dict[str, str] = {}
    for item in load_training_universe_manifest():
        symbol = normalize_catalog_symbol(item.get("symbol", ""), "us_equity")
        group = str(item.get("group") or "").strip()
        if symbol and group:
            groups[symbol] = group
    return groups


def _curated_peer_reason(target_symbol: str, item_symbol: str) -> str | None:
    direct_reason = _CURATED_STOCK_PEERS.get(target_symbol, {}).get(item_symbol)
    if direct_reason:
        return direct_reason
    reverse_reason = _CURATED_STOCK_PEERS.get(item_symbol, {}).get(target_symbol)
    if reverse_reason:
        return reverse_reason
    return None


def _friendly_group_label(group: str | None) -> str | None:
    if not group:
        return None
    return group.replace("_", " ").title()


def _similarity_reason(
    *,
    curated_reason: str | None,
    target_category: str,
    same_training_group: bool,
    training_group: str | None,
    same_exchange: bool,
    shared_tokens: set[str],
    shared_etf_family: set[str],
    same_crypto_quote: bool,
) -> str:
    if curated_reason:
        return curated_reason

    if target_category == "crypto":
        if same_crypto_quote:
            return "Same crypto quote market"
        return "Related crypto market"

    if target_category == "etfs":
        if shared_etf_family:
            return "Same ETF family"
        if shared_tokens:
            return "Related fund exposure"
        return "Same ETF category"

    if same_training_group:
        group_label = _friendly_group_label(training_group)
        return f"{group_label} peer" if group_label else "Same market group"
    if shared_tokens and same_exchange:
        return "Related stock on the same exchange"
    if shared_tokens:
        return "Related company profile"
    return "Same market category"


def _score_similar_catalog_item(
    *,
    target_symbol: str,
    target_category: str,
    target_asset_class: str,
    target_exchange: str,
    target_tokens: set[str],
    target_crypto_quote: str | None,
    training_groups: dict[str, str],
    item: dict,
) -> tuple[int, str] | None:
    item_asset_class = str(item.get("asset_class") or "us_equity").strip().lower()
    item_symbol = normalize_catalog_symbol(item.get("symbol", ""), item_asset_class)
    if not item_symbol or item_symbol == target_symbol:
        return None
    if not is_chartable_instrument(item):
        return None

    item_category = get_symbol_market_category(item_symbol)
    if item_category != target_category:
        return None

    item_exchange = str(item.get("exchange") or "").upper()
    item_tokens = _meaningful_name_tokens(item.get("name", ""))
    shared_tokens = target_tokens.intersection(item_tokens)
    shared_etf_family = shared_tokens.intersection(_ETF_FAMILY_TOKENS)
    same_exchange = bool(target_exchange and item_exchange == target_exchange)
    _, item_crypto_quote = _crypto_parts(item_symbol)
    same_crypto_quote = bool(target_crypto_quote and item_crypto_quote == target_crypto_quote)
    curated_reason = _curated_peer_reason(target_symbol, item_symbol)
    target_training_group = training_groups.get(target_symbol)
    item_training_group = training_groups.get(item_symbol)
    same_training_group = bool(
        target_training_group
        and item_training_group
        and target_training_group == item_training_group
    )

    if (
        target_category == "stocks"
        and not curated_reason
        and not same_training_group
        and not shared_tokens
    ):
        return None

    score = 100
    if item_asset_class == target_asset_class:
        score += 20
    if curated_reason:
        score += 90
    if same_training_group:
        score += 55
    if same_exchange:
        score += 12
    if shared_tokens:
        score += min(len(shared_tokens), 4) * 7
    if shared_etf_family:
        score += 18
    if same_crypto_quote:
        score += 24

    # Prefer cleaner, more liquid-looking major symbols when scores tie.
    if len(item_symbol) <= 5:
        score += 2

    reason = _similarity_reason(
        curated_reason=curated_reason,
        target_category=target_category,
        same_training_group=same_training_group,
        training_group=target_training_group,
        same_exchange=same_exchange,
        shared_tokens=shared_tokens,
        shared_etf_family=shared_etf_family,
        same_crypto_quote=same_crypto_quote,
    )
    return score, reason


async def get_similar_instruments(
    symbol: str,
    *,
    limit: int = 8,
) -> SimilarInstrumentsResponse:
    asset_class = get_symbol_asset_class(symbol)
    normalized_symbol = normalize_catalog_symbol(symbol, asset_class)
    metadata = get_symbol_metadata(normalized_symbol)
    if not metadata:
        raise ValueError("That instrument is not available in the supported catalog.")
    if not is_chartable_instrument(metadata):
        raise ValueError("That instrument is not currently available for similar instruments.")

    canonical_symbol = metadata.get("symbol") or normalized_symbol
    target_asset_class = metadata.get("asset_class", asset_class)
    target_category = get_symbol_market_category(canonical_symbol)
    target_exchange = str(metadata.get("exchange") or "").upper()
    target_tokens = _meaningful_name_tokens(metadata.get("name", ""))
    _, target_crypto_quote = _crypto_parts(canonical_symbol)
    training_groups = _training_universe_groups()
    safe_limit = min(max(limit, 1), SIMILAR_INSTRUMENT_LIMIT_MAX)

    scored_items: list[tuple[int, str, dict]] = []
    for item in load_symbol_catalog():
        scored = _score_similar_catalog_item(
            target_symbol=canonical_symbol,
            target_category=target_category,
            target_asset_class=target_asset_class,
            target_exchange=target_exchange,
            target_tokens=target_tokens,
            target_crypto_quote=target_crypto_quote,
            training_groups=training_groups,
            item=item,
        )
        if not scored:
            continue
        score, reason = scored
        scored_items.append((score, reason, item))

    scored_items.sort(
        key=lambda entry: (
            entry[0],
            entry[2].get("tradable", True),
            entry[2].get("symbol", ""),
        ),
        reverse=True,
    )
    selected_items = scored_items[:safe_limit]
    selected_symbols = [
        normalize_catalog_symbol(item.get("symbol", ""), item.get("asset_class", "us_equity"))
        for _, _, item in selected_items
    ]
    quotes = await get_public_quotes_cached(selected_symbols) if selected_symbols else []
    quotes_by_symbol = {quote.symbol.upper(): quote for quote in quotes}

    return SimilarInstrumentsResponse(
        symbol=canonical_symbol,
        assetCategory=target_category,
        results=[
            SimilarInstrumentOut(
                **build_search_result(item),
                similarityReason=reason,
                latestQuote=quotes_by_symbol.get(
                    normalize_catalog_symbol(
                        item.get("symbol", ""),
                        item.get("asset_class", "us_equity"),
                    ).upper()
                ),
            )
            for _, reason, item in selected_items
        ],
    )


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
            get_daily_bar_series_cached(
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
        latestQuote=_quote_out(latest_quote),
        historicalSeries=[
            _price_point_from_bar(row)
            for row in historical_series
        ],
    )
