from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from app.core.config import settings
from app.integrations.alpaca.assets import fetch_assets_catalog


_CATALOG_MTIME_CHECK_INTERVAL_SECONDS = 30.0
_MOVER_UNIVERSE_REFRESH_TTL_SECONDS = 1800.0
_DEGRADED_MOVER_UNIVERSE_REFRESH_TTL_SECONDS = 60.0
_CRYPTO_QUOTE_SUFFIXES = ("USD",)
# Cap the dynamic crypto mover universe to prevent the ranked-period scan from
# creating hundreds of concurrent coroutines and exhausting the 512 MB heap.
_CRYPTO_MOVER_UNIVERSE_MAX_SYMBOLS = 25
_ETF_NAME_HINTS = (
    " ETF",
    " ETN",
    " FUND",
    " TRUST",
    " SHARES",
    " ISHARES",
    " SPDR",
    " INVESCO",
    " VANGUARD",
    " PROSHARES",
    " DIREXION",
    " VANECK",
    " WISDOMTREE",
    " ARK ",
)

logger = logging.getLogger(__name__)


DEFAULT_SYMBOL_CATALOG: List[Dict[str, Any]] = [
    # US equities
    {"symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "AMZN", "name": "Amazon.com, Inc.", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "GOOGL", "name": "Alphabet Inc. Class A", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "META", "name": "Meta Platforms, Inc.", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "TSLA", "name": "Tesla, Inc.", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "AMD", "name": "Advanced Micro Devices, Inc.", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "NFLX", "name": "Netflix, Inc.", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "INTC", "name": "Intel Corporation", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "JPM", "name": "JPMorgan Chase & Co.", "exchange": "NYSE", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "BAC", "name": "Bank of America Corporation", "exchange": "NYSE", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "V", "name": "Visa Inc.", "exchange": "NYSE", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "MA", "name": "Mastercard Incorporated", "exchange": "NYSE", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "WMT", "name": "Walmart Inc.", "exchange": "NYSE", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "DIS", "name": "The Walt Disney Company", "exchange": "NYSE", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "KO", "name": "The Coca-Cola Company", "exchange": "NYSE", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "PEP", "name": "PepsiCo, Inc.", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "XOM", "name": "Exxon Mobil Corporation", "exchange": "NYSE", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "CVX", "name": "Chevron Corporation", "exchange": "NYSE", "tradable": True, "asset_class": "us_equity"},
    # Index ETFs
    {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust (Nasdaq 100)", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "DIA", "name": "SPDR Dow Jones Industrial Average ETF", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "IWM", "name": "iShares Russell 2000 ETF", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "VOO", "name": "Vanguard S&P 500 ETF", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "VTI", "name": "Vanguard Total Stock Market ETF", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "XLK", "name": "Technology Select Sector SPDR Fund", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "XLF", "name": "Financial Select Sector SPDR Fund", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "XLV", "name": "Health Care Select Sector SPDR Fund", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "XLE", "name": "Energy Select Sector SPDR Fund", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "SMH", "name": "VanEck Semiconductor ETF", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "ARKK", "name": "ARK Innovation ETF", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "TLT", "name": "iShares 20+ Year Treasury Bond ETF", "exchange": "NASDAQ", "tradable": True, "asset_class": "us_equity"},
    {"symbol": "GLD", "name": "SPDR Gold Shares", "exchange": "ARCA", "tradable": True, "asset_class": "us_equity"},
    # Crypto
    {"symbol": "BTC/USD", "name": "Bitcoin", "exchange": "CRYPTO", "tradable": True, "asset_class": "crypto"},
    {"symbol": "ETH/USD", "name": "Ethereum", "exchange": "CRYPTO", "tradable": True, "asset_class": "crypto"},
    {"symbol": "SOL/USD", "name": "Solana", "exchange": "CRYPTO", "tradable": True, "asset_class": "crypto"},
    {"symbol": "DOGE/USD", "name": "Dogecoin", "exchange": "CRYPTO", "tradable": True, "asset_class": "crypto"},
    {"symbol": "ADA/USD", "name": "Cardano", "exchange": "CRYPTO", "tradable": True, "asset_class": "crypto"},
    {"symbol": "XRP/USD", "name": "XRP", "exchange": "CRYPTO", "tradable": True, "asset_class": "crypto"},
    {"symbol": "AVAX/USD", "name": "Avalanche", "exchange": "CRYPTO", "tradable": True, "asset_class": "crypto"},
    {"symbol": "LINK/USD", "name": "Chainlink", "exchange": "CRYPTO", "tradable": True, "asset_class": "crypto"},
    {"symbol": "DOT/USD", "name": "Polkadot", "exchange": "CRYPTO", "tradable": True, "asset_class": "crypto"},
]

DEFAULT_MOVER_UNIVERSE_BY_CATEGORY: Dict[str, List[str]] = {
    "stocks": [
        "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL",
        "META", "TSLA", "AMD", "NFLX", "INTC",
        "JPM", "BAC", "V", "MA", "WMT",
        "DIS", "KO", "PEP", "XOM", "CVX",
    ],
    "crypto": [
        "BTC/USD", "ETH/USD", "SOL/USD", "DOGE/USD", "ADA/USD",
        "XRP/USD", "AVAX/USD", "LINK/USD", "DOT/USD",
    ],
    "etfs": [
        "SPY", "QQQ", "DIA", "IWM", "VOO",
        "VTI", "XLK", "XLF", "XLV", "XLE",
        "SMH", "ARKK", "TLT", "GLD",
    ],
}

DEFAULT_MOVER_UNIVERSE: List[str] = [
    symbol
    for category_symbols in DEFAULT_MOVER_UNIVERSE_BY_CATEGORY.values()
    for symbol in category_symbols
]

DEFAULT_TRAINING_UNIVERSE_MANIFEST: List[Dict[str, Any]] = [
    {"symbol": "AAPL", "enabled": True, "group": "technology", "reason": "Large-cap platform and consumer hardware exposure"},
    {"symbol": "MSFT", "enabled": True, "group": "technology", "reason": "Large-cap software and cloud exposure"},
    {"symbol": "NVDA", "enabled": True, "group": "technology", "reason": "Semiconductor and AI infrastructure exposure"},
    {"symbol": "AMZN", "enabled": True, "group": "consumer_discretionary", "reason": "Consumer and cloud cross-sector exposure"},
    {"symbol": "GOOGL", "enabled": True, "group": "communication_services", "reason": "Advertising and internet services exposure"},
    {"symbol": "META", "enabled": True, "group": "communication_services", "reason": "Social media and digital advertising exposure"},
    {"symbol": "TSLA", "enabled": True, "group": "consumer_discretionary", "reason": "High-volatility consumer discretionary exposure"},
    {"symbol": "AMD", "enabled": True, "group": "technology", "reason": "Semiconductor cycle exposure"},
    {"symbol": "NFLX", "enabled": True, "group": "communication_services", "reason": "Streaming and media exposure"},
    {"symbol": "INTC", "enabled": True, "group": "technology", "reason": "Legacy semiconductor cycle exposure"},
    {"symbol": "JPM", "enabled": True, "group": "financials", "reason": "Large-cap banking exposure"},
    {"symbol": "BAC", "enabled": True, "group": "financials", "reason": "Consumer and commercial banking exposure"},
    {"symbol": "V", "enabled": True, "group": "financials", "reason": "Payments network exposure"},
    {"symbol": "MA", "enabled": True, "group": "financials", "reason": "Global payments exposure"},
    {"symbol": "WMT", "enabled": True, "group": "consumer_staples", "reason": "Defensive consumer exposure"},
    {"symbol": "DIS", "enabled": True, "group": "communication_services", "reason": "Media and parks exposure"},
    {"symbol": "KO", "enabled": True, "group": "consumer_staples", "reason": "Defensive beverage exposure"},
    {"symbol": "PEP", "enabled": True, "group": "consumer_staples", "reason": "Staples and beverage exposure"},
    {"symbol": "XOM", "enabled": True, "group": "energy", "reason": "Integrated energy exposure"},
    {"symbol": "CVX", "enabled": True, "group": "energy", "reason": "Integrated energy exposure"},
    {"symbol": "ABBV", "enabled": True, "group": "healthcare", "reason": "Pharmaceutical exposure"},
    {"symbol": "COST", "enabled": True, "group": "consumer_staples", "reason": "Warehouse retail exposure"},
    {"symbol": "HD", "enabled": True, "group": "consumer_discretionary", "reason": "Home improvement exposure"},
    {"symbol": "MCD", "enabled": True, "group": "consumer_discretionary", "reason": "Global restaurant exposure"},
    {"symbol": "UNH", "enabled": True, "group": "healthcare", "reason": "Managed healthcare exposure"},
    {"symbol": "CRM", "enabled": True, "group": "technology", "reason": "Enterprise software exposure"},
    {"symbol": "ADBE", "enabled": True, "group": "technology", "reason": "Creative software exposure"},
    {"symbol": "ORCL", "enabled": True, "group": "technology", "reason": "Database and enterprise software exposure"},
    {"symbol": "QCOM", "enabled": True, "group": "technology", "reason": "Wireless semiconductor exposure"},
    {"symbol": "AVGO", "enabled": True, "group": "technology", "reason": "Broad semiconductor exposure"},
]


def normalize_catalog_symbol(
    symbol: Any,
    asset_class: Optional[str] = None,
) -> str:
    normalized_symbol = str(symbol or "").strip().upper()
    if not normalized_symbol:
        return ""

    if asset_class == "crypto":
        if "/" in normalized_symbol:
            return normalized_symbol

        for quote_suffix in _CRYPTO_QUOTE_SUFFIXES:
            if normalized_symbol.endswith(quote_suffix) and len(normalized_symbol) > len(quote_suffix):
                return f"{normalized_symbol[:-len(quote_suffix)]}/{quote_suffix}"

    return normalized_symbol


def _normalize_catalog_item(item: Dict[str, Any]) -> Dict[str, Any]:
    normalized_item = dict(item)
    asset_class = str(
        normalized_item.get("asset_class") or normalized_item.get("class") or "us_equity"
    ).strip().lower() or "us_equity"
    normalized_item["asset_class"] = asset_class
    normalized_item["symbol"] = normalize_catalog_symbol(normalized_item.get("symbol"), asset_class)
    normalized_item["name"] = normalized_item.get("name") or normalized_item["symbol"]
    return normalized_item


def _merge_default_catalog_entries(catalog: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: List[Dict[str, Any]] = []
    seen_symbols: set[str] = set()

    # Process defaults FIRST to ensure core symbols (BTC/USD, ETH/USD, XRP/USD, etc.)
    # are present even if Alpaca's live catalog has conflicts or is incomplete.
    for raw_item in [*DEFAULT_SYMBOL_CATALOG, *catalog]:
        item = _normalize_catalog_item(raw_item)
        symbol = item.get("symbol")
        if not symbol or symbol in seen_symbols:
            continue
        seen_symbols.add(symbol)
        merged.append(item)

    return merged


def _build_symbol_index(catalog: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    index: Dict[str, Dict[str, Any]] = {}

    for item in catalog:
        symbol = str(item.get("symbol") or "").strip().upper()
        if not symbol:
            continue

        normalized_symbol = normalize_catalog_symbol(symbol, item.get("asset_class"))
        index[normalized_symbol] = item

        if item.get("asset_class") == "crypto":
            index[normalized_symbol.replace("/", "")] = item

    return index


_symbol_catalog_cache_path: Optional[str] = None
_symbol_catalog_cache_mtime_ns: Optional[int] = None
_symbol_catalog_cache_data: List[Dict[str, Any]] = _merge_default_catalog_entries(DEFAULT_SYMBOL_CATALOG)
_symbol_catalog_cache_index: Dict[str, Dict[str, Any]] = _build_symbol_index(
    _symbol_catalog_cache_data
)
_symbol_catalog_last_check_monotonic: float = 0.0
_dynamic_crypto_mover_universe_cache: List[str] = []
_dynamic_crypto_mover_universe_last_refresh_monotonic: float = 0.0
_dynamic_crypto_mover_universe_ttl_seconds: float = _DEGRADED_MOVER_UNIVERSE_REFRESH_TTL_SECONDS


def _catalog_path() -> Path:
    return settings.symbol_catalog_path


def _training_universe_path() -> Path:
    return settings.prediction_training_universe_path


def _hydrate_symbol_catalog_cache(
    catalog: Iterable[Dict[str, Any]],
    *,
    path: Optional[Path] = None,
    mtime_ns: Optional[int] = None,
) -> List[Dict[str, Any]]:
    global _symbol_catalog_cache_path
    global _symbol_catalog_cache_mtime_ns
    global _symbol_catalog_cache_data
    global _symbol_catalog_cache_index
    global _symbol_catalog_last_check_monotonic

    normalized_catalog = _merge_default_catalog_entries(catalog)
    _symbol_catalog_cache_data = normalized_catalog
    _symbol_catalog_cache_index = _build_symbol_index(normalized_catalog)
    _symbol_catalog_last_check_monotonic = time.monotonic()
    _symbol_catalog_cache_path = str(path.resolve()) if path else None
    _symbol_catalog_cache_mtime_ns = mtime_ns
    return list(_symbol_catalog_cache_data)


def _catalog_entry_from_asset(asset: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    symbol = asset.get("symbol")
    if not symbol:
        return None

    return {
        "symbol": symbol,
        "name": asset.get("name") or symbol,
        "exchange": asset.get("exchange"),
        "status": asset.get("status"),
        "asset_class": asset.get("class") or asset.get("asset_class") or "us_equity",
        "tradable": bool(asset.get("tradable", True)),
    }


def build_symbol_catalog_from_assets(assets: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        entry
        for entry in (_catalog_entry_from_asset(asset) for asset in assets)
        if entry and entry.get("symbol")
    ]


def load_symbol_catalog(force: bool = False) -> List[Dict[str, Any]]:
    global _symbol_catalog_cache_path
    global _symbol_catalog_cache_mtime_ns
    global _symbol_catalog_cache_data
    global _symbol_catalog_cache_index
    global _symbol_catalog_last_check_monotonic

    now = time.monotonic()
    if (
        not force
        and _symbol_catalog_cache_path is not None
        and (now - _symbol_catalog_last_check_monotonic)
        < _CATALOG_MTIME_CHECK_INTERVAL_SECONDS
    ):
        return list(_symbol_catalog_cache_data)

    path = _catalog_path()
    _symbol_catalog_last_check_monotonic = now

    if path.exists():
        try:
            resolved_path = str(path.resolve())
            current_mtime_ns = path.stat().st_mtime_ns
            if (
                _symbol_catalog_cache_path == resolved_path
                and _symbol_catalog_cache_mtime_ns == current_mtime_ns
            ):
                return list(_symbol_catalog_cache_data)

            loaded = json.loads(path.read_text())
            if isinstance(loaded, list):
                return _hydrate_symbol_catalog_cache(
                    loaded,
                    path=path,
                    mtime_ns=current_mtime_ns,
                )
        except Exception:
            return list(_symbol_catalog_cache_data)
    return list(_symbol_catalog_cache_data)


def save_symbol_catalog(catalog: List[Dict[str, Any]]) -> Path:
    path = _catalog_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized_catalog = _merge_default_catalog_entries(catalog)
    path.write_text(json.dumps(normalized_catalog, indent=2, sort_keys=True))
    _hydrate_symbol_catalog_cache(
        normalized_catalog,
        path=path,
        mtime_ns=path.stat().st_mtime_ns,
    )
    return path


def load_training_universe_manifest() -> List[Dict[str, Any]]:
    path = _training_universe_path()
    if path.exists():
        try:
            data = json.loads(path.read_text())
            if isinstance(data, list):
                return data
        except Exception:
            return list(DEFAULT_TRAINING_UNIVERSE_MANIFEST)
    return list(DEFAULT_TRAINING_UNIVERSE_MANIFEST)


def get_symbol_metadata(symbol: str) -> Optional[Dict[str, Any]]:
    normalized = symbol.strip().upper()
    # Lazily refresh the cache (throttled inside load_symbol_catalog) so this
    # lookup is effectively a single dict read on the hot path.
    load_symbol_catalog()
    return _symbol_catalog_cache_index.get(normalized)


def get_symbol_asset_class(symbol: str) -> str:
    metadata = get_symbol_metadata(symbol)
    if metadata and metadata.get("asset_class"):
        return str(metadata["asset_class"]).strip().lower()

    normalized = symbol.strip().upper()
    if "/" in normalized and any(
        normalized.endswith(f"/{quote_suffix}") for quote_suffix in _CRYPTO_QUOTE_SUFFIXES
    ):
        return "crypto"
    if any(
        normalized.endswith(quote_suffix) and len(normalized) > len(quote_suffix)
        for quote_suffix in _CRYPTO_QUOTE_SUFFIXES
    ):
        return "crypto"
    return "us_equity"


def get_symbol_market_category(symbol: str) -> str:
    if get_symbol_asset_class(symbol) == "crypto":
        return "crypto"

    metadata = get_symbol_metadata(symbol) or {}
    normalized_name = str(metadata.get("name") or "").strip().upper()
    if normalized_name and any(hint in normalized_name for hint in _ETF_NAME_HINTS):
        return "etfs"

    return "stocks"


def is_chartable_instrument(item: Optional[Dict[str, Any]]) -> bool:
    if not item:
        return False

    is_active = str(item.get("status", "active")).lower() == "active"
    is_tradable = bool(item.get("tradable", True))
    return is_active and is_tradable


def _match_score(item: Dict[str, Any], query: str) -> float:
    normalized_query = query.strip().lower()
    symbol = item.get("symbol", "").lower()
    name = item.get("name", "").lower()

    if normalized_query == symbol:
        return 1.0
    if symbol.startswith(normalized_query):
        return 0.96
    if normalized_query in symbol:
        return 0.9
    if name.startswith(normalized_query):
        return 0.86
    if normalized_query in name:
        return 0.75
    return 0.0


def search_symbol_catalog(
    query: str,
    *,
    limit: int = 10,
    chartable_only: bool = True,
) -> List[Dict[str, Any]]:
    normalized_query = query.strip()
    if not normalized_query:
        return []

    ranked: List[Dict[str, Any]] = []
    for item in load_symbol_catalog():
        if chartable_only and not is_chartable_instrument(item):
            continue
        score = _match_score(item, normalized_query)
        if score <= 0:
            continue
        result = dict(item)
        result["matchScore"] = score
        ranked.append(result)

    ranked.sort(key=lambda item: (item["matchScore"], item.get("symbol", "")), reverse=True)
    return ranked[:limit]


def build_search_result(item: Dict[str, Any]) -> Dict[str, Any]:
    asset_class = item.get("asset_class", "us_equity")
    symbol = normalize_catalog_symbol(item.get("symbol", ""), asset_class)
    is_crypto = asset_class == "crypto"
    quote_currency = symbol.split("/")[-1] if is_crypto and "/" in symbol else "USD"

    return {
        "symbol": symbol,
        "name": item.get("name", ""),
        "type": asset_class,
        "assetCategory": get_symbol_market_category(symbol),
        "region": "Global" if is_crypto else "US",
        "marketOpen": "00:00" if is_crypto else "09:30",
        "marketClose": "23:59" if is_crypto else "16:00",
        "timezone": "UTC" if is_crypto else "America/New_York",
        "currency": quote_currency,
        "matchScore": item.get("matchScore"),
        "exchange": item.get("exchange") or ("CRYPTO" if is_crypto else None),
        "status": item.get("status", "active"),
        "tradable": bool(item.get("tradable", True)),
    }


def get_mover_universe_symbols() -> List[str]:
    return list(DEFAULT_MOVER_UNIVERSE)


def get_mover_universe_symbols_by_category() -> Dict[str, List[str]]:
    return {
        category: list(symbols)
        for category, symbols in DEFAULT_MOVER_UNIVERSE_BY_CATEGORY.items()
    }


def _extract_dynamic_crypto_mover_symbols(catalog: Iterable[Dict[str, Any]]) -> List[str]:
    symbols: List[str] = []
    seen: set[str] = set()

    for raw_item in catalog:
        item = _normalize_catalog_item(raw_item)
        if item.get("asset_class") != "crypto":
            continue
        if not bool(item.get("tradable", True)):
            continue
        if str(item.get("status", "active")).strip().lower() != "active":
            continue

        symbol = normalize_catalog_symbol(item.get("symbol"), "crypto")
        if not symbol or not symbol.endswith("/USD") or symbol in seen:
            continue

        seen.add(symbol)
        symbols.append(symbol)

    # Sort alphabetically for reproducibility, then cap to avoid memory spikes
    # when this list is used by _rank_period_candidates on the 512 MB Render instance.
    return sorted(symbols)[:_CRYPTO_MOVER_UNIVERSE_MAX_SYMBOLS]


async def get_dynamic_mover_universe_symbols_by_category(
    *, force_refresh: bool = False
) -> Dict[str, List[str]]:
    global _dynamic_crypto_mover_universe_cache
    global _dynamic_crypto_mover_universe_last_refresh_monotonic
    global _dynamic_crypto_mover_universe_ttl_seconds

    now = time.monotonic()
    if (
        not force_refresh
        and _dynamic_crypto_mover_universe_cache
        and (now - _dynamic_crypto_mover_universe_last_refresh_monotonic)
        < _dynamic_crypto_mover_universe_ttl_seconds
    ):
        return {
            "stocks": list(DEFAULT_MOVER_UNIVERSE_BY_CATEGORY["stocks"]),
            "crypto": list(_dynamic_crypto_mover_universe_cache),
            "etfs": list(DEFAULT_MOVER_UNIVERSE_BY_CATEGORY["etfs"]),
        }

    crypto_symbols: List[str] = []
    live_catalog: List[Dict[str, Any]] = []
    try:
        live_assets = await fetch_assets_catalog()
        live_catalog = build_symbol_catalog_from_assets(live_assets)
        crypto_symbols = _extract_dynamic_crypto_mover_symbols(live_catalog)
    except Exception:
        crypto_symbols = []

    used_fallback = False
    if crypto_symbols:
        save_symbol_catalog(live_catalog)
        _dynamic_crypto_mover_universe_ttl_seconds = _MOVER_UNIVERSE_REFRESH_TTL_SECONDS
    else:
        used_fallback = True
        crypto_symbols = _extract_dynamic_crypto_mover_symbols(
            load_symbol_catalog(force=force_refresh)
        )

    if not crypto_symbols:
        used_fallback = True
        crypto_symbols = list(DEFAULT_MOVER_UNIVERSE_BY_CATEGORY["crypto"])

    if used_fallback:
        _dynamic_crypto_mover_universe_ttl_seconds = (
            _DEGRADED_MOVER_UNIVERSE_REFRESH_TTL_SECONDS
        )
        logger.warning(
            "Using fallback crypto mover universe with %s symbols.",
            len(crypto_symbols),
        )

    _dynamic_crypto_mover_universe_cache = list(crypto_symbols)
    _dynamic_crypto_mover_universe_last_refresh_monotonic = now

    return {
        "stocks": list(DEFAULT_MOVER_UNIVERSE_BY_CATEGORY["stocks"]),
        "crypto": list(_dynamic_crypto_mover_universe_cache),
        "etfs": list(DEFAULT_MOVER_UNIVERSE_BY_CATEGORY["etfs"]),
    }


def get_training_universe_symbols() -> List[str]:
    configured_symbols = settings.prediction_training_universe
    if configured_symbols:
        return configured_symbols

    catalog_symbols = {
        item.get("symbol", "").upper()
        for item in load_symbol_catalog()
        if item.get("symbol") and item.get("tradable", True)
    }
    manifest_symbols = [
        str(item.get("symbol", "")).strip().upper()
        for item in load_training_universe_manifest()
        if item.get("enabled", True) and item.get("symbol")
    ]
    curated_symbols = [
        symbol
        for symbol in manifest_symbols
        if symbol in catalog_symbols
    ]
    if curated_symbols:
        return curated_symbols
    return manifest_symbols


def resolve_company_name(symbol: str) -> str:
    metadata = get_symbol_metadata(symbol)
    if metadata and metadata.get("name"):
        return metadata["name"]
    return normalize_catalog_symbol(symbol, get_symbol_asset_class(symbol))
