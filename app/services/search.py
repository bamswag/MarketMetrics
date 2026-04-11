from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from app.core.config import settings


DEFAULT_SYMBOL_CATALOG: List[Dict[str, Any]] = [
    {"symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "AMZN", "name": "Amazon.com, Inc.", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "GOOGL", "name": "Alphabet Inc. Class A", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "META", "name": "Meta Platforms, Inc.", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "TSLA", "name": "Tesla, Inc.", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "AMD", "name": "Advanced Micro Devices, Inc.", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "NFLX", "name": "Netflix, Inc.", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "INTC", "name": "Intel Corporation", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "JPM", "name": "JPMorgan Chase & Co.", "exchange": "NYSE", "tradable": True},
    {"symbol": "BAC", "name": "Bank of America Corporation", "exchange": "NYSE", "tradable": True},
    {"symbol": "V", "name": "Visa Inc.", "exchange": "NYSE", "tradable": True},
    {"symbol": "MA", "name": "Mastercard Incorporated", "exchange": "NYSE", "tradable": True},
    {"symbol": "WMT", "name": "Walmart Inc.", "exchange": "NYSE", "tradable": True},
    {"symbol": "DIS", "name": "The Walt Disney Company", "exchange": "NYSE", "tradable": True},
    {"symbol": "KO", "name": "The Coca-Cola Company", "exchange": "NYSE", "tradable": True},
    {"symbol": "PEP", "name": "PepsiCo, Inc.", "exchange": "NASDAQ", "tradable": True},
    {"symbol": "XOM", "name": "Exxon Mobil Corporation", "exchange": "NYSE", "tradable": True},
    {"symbol": "CVX", "name": "Chevron Corporation", "exchange": "NYSE", "tradable": True},
    {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "exchange": "ARCA", "tradable": True},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust", "exchange": "NASDAQ", "tradable": True},
]

DEFAULT_MOVER_UNIVERSE: List[str] = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "TSLA",
    "AMD",
    "NFLX",
    "INTC",
    "JPM",
    "BAC",
    "V",
    "MA",
    "WMT",
    "DIS",
    "KO",
    "PEP",
    "XOM",
    "CVX",
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

_symbol_catalog_cache_path: Optional[str] = None
_symbol_catalog_cache_mtime_ns: Optional[int] = None
_symbol_catalog_cache_data: List[Dict[str, Any]] = list(DEFAULT_SYMBOL_CATALOG)
_symbol_catalog_cache_index: Dict[str, Dict[str, Any]] = {
    str(item.get("symbol", "")).strip().upper(): item
    for item in DEFAULT_SYMBOL_CATALOG
    if item.get("symbol")
}


def _catalog_path() -> Path:
    return settings.symbol_catalog_path


def _training_universe_path() -> Path:
    return settings.prediction_training_universe_path


def load_symbol_catalog() -> List[Dict[str, Any]]:
    path = _catalog_path()
    if path.exists():
        try:
            global _symbol_catalog_cache_path
            global _symbol_catalog_cache_mtime_ns
            global _symbol_catalog_cache_data
            global _symbol_catalog_cache_index

            resolved_path = str(path.resolve())
            current_mtime_ns = path.stat().st_mtime_ns
            if (
                _symbol_catalog_cache_path == resolved_path
                and _symbol_catalog_cache_mtime_ns == current_mtime_ns
            ):
                return list(_symbol_catalog_cache_data)

            loaded = json.loads(path.read_text())
            if isinstance(loaded, list):
                _symbol_catalog_cache_path = resolved_path
                _symbol_catalog_cache_mtime_ns = current_mtime_ns
                _symbol_catalog_cache_data = loaded
                _symbol_catalog_cache_index = {
                    str(item.get("symbol", "")).strip().upper(): item
                    for item in loaded
                    if item.get("symbol")
                }
                return list(_symbol_catalog_cache_data)
        except Exception:
            return list(DEFAULT_SYMBOL_CATALOG)
    return list(DEFAULT_SYMBOL_CATALOG)


def save_symbol_catalog(catalog: List[Dict[str, Any]]) -> Path:
    path = _catalog_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(catalog, indent=2, sort_keys=True))
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
    load_symbol_catalog()
    return _symbol_catalog_cache_index.get(normalized)


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
    return {
        "symbol": item.get("symbol", ""),
        "name": item.get("name", ""),
        "type": item.get("asset_class", "us_equity"),
        "region": "US",
        "marketOpen": "09:30",
        "marketClose": "16:00",
        "timezone": "America/New_York",
        "currency": "USD",
        "matchScore": item.get("matchScore"),
        "exchange": item.get("exchange"),
        "status": item.get("status", "active"),
        "tradable": bool(item.get("tradable", True)),
    }


def get_mover_universe_symbols() -> List[str]:
    return list(DEFAULT_MOVER_UNIVERSE)


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
    return symbol.strip().upper()
