from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.integrations.alpaca.market_data import fetch_snapshots
from app.orm_models.watchlist_item import WatchlistItemDB
from app.schemas.watchlists import (
    WatchlistAlertSummaryOut,
    WatchlistItemDetailedOut,
    WatchlistQuoteOut,
)
from app.services.alerts import get_alert_counts_for_symbols
from app.services.quotes import get_quote_cached
from app.services.search import (
    get_symbol_market_category,
    get_symbol_asset_class,
    get_symbol_metadata,
    normalize_catalog_symbol,
)


def add_watchlist_item(db: Session, user_id: str, symbol: str) -> WatchlistItemDB:
    asset_class = get_symbol_asset_class(symbol)
    symbol = normalize_catalog_symbol(symbol, asset_class)
    metadata = get_symbol_metadata(symbol)
    if metadata and metadata.get("symbol"):
        symbol = metadata["symbol"]

    existing = (
        db.query(WatchlistItemDB)
        .filter(
            WatchlistItemDB.userID == user_id,
            WatchlistItemDB.symbol == symbol,
        )
        .first()
    )
    if existing:
        raise ValueError("Symbol already exists in watchlist")

    item = WatchlistItemDB(
        userID=user_id,
        symbol=symbol,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_watchlist_items(db: Session, user_id: str):
    return (
        db.query(WatchlistItemDB)
        .filter(WatchlistItemDB.userID == user_id)
        .order_by(WatchlistItemDB.createdAt.desc())
        .all()
    )


async def get_watchlist_items_detailed(
    db: Session,
    user_id: str,
) -> list[WatchlistItemDetailedOut]:
    items = get_watchlist_items(db, user_id)
    if not items:
        return []

    symbols = [item.symbol for item in items]
    asset_class_map = {symbol: get_symbol_asset_class(symbol) for symbol in symbols}
    alert_counts = get_alert_counts_for_symbols(db, user_id, symbols)

    snapshots: Dict[str, Dict[str, Any]]
    batch_error: Optional[str] = None
    try:
        snapshots = await fetch_snapshots(symbols, asset_class_map=asset_class_map)
    except Exception as exc:  # pragma: no cover - defensive fallback
        snapshots = {}
        batch_error = str(exc) or repr(exc)

    detailed_items: list[WatchlistItemDetailedOut] = []
    for item in items:
        normalized_symbol = item.symbol.strip().upper()
        snapshot = snapshots.get(normalized_symbol)
        latest_quote = _snapshot_to_watchlist_quote(snapshot, batch_error)

        total_alerts, active_alerts, triggered_alerts = alert_counts.get(
            item.symbol, (0, 0, 0)
        )

        detailed_items.append(
            WatchlistItemDetailedOut(
                id=item.id,
                userID=item.userID,
                symbol=item.symbol,
                createdAt=item.createdAt,
                assetCategory=get_symbol_market_category(item.symbol),
                latestQuote=latest_quote,
                alerts=WatchlistAlertSummaryOut(
                    totalAlerts=total_alerts,
                    activeAlerts=active_alerts,
                    triggeredAlerts=triggered_alerts,
                ),
            )
        )

    return detailed_items


def _snapshot_to_watchlist_quote(
    snapshot: Optional[Dict[str, Any]],
    batch_error: Optional[str] = None,
) -> WatchlistQuoteOut:
    if not snapshot:
        return WatchlistQuoteOut(
            unavailableReason=batch_error or "No quote data available."
        )
    return WatchlistQuoteOut(
        price=snapshot.get("price"),
        change=snapshot.get("change"),
        changePercent=snapshot.get("changePercent"),
        latestTradingDay=snapshot.get("latestTradingDay"),
        source=snapshot.get("source"),
    )


async def get_quote_for_watchlist_item(symbol: str) -> WatchlistQuoteOut:
    """Legacy single-symbol helper kept for backward compatibility."""
    try:
        quote = await get_quote_cached(symbol)
        return WatchlistQuoteOut(
            price=quote.get("price"),
            change=quote.get("change"),
            changePercent=quote.get("changePercent"),
            latestTradingDay=quote.get("latestTradingDay"),
            source=quote.get("source"),
        )
    except Exception as exc:
        return WatchlistQuoteOut(unavailableReason=str(exc) or repr(exc))


def delete_watchlist_item(db: Session, user_id: str, symbol: str) -> bool:
    symbol = normalize_catalog_symbol(symbol, get_symbol_asset_class(symbol))

    item = (
        db.query(WatchlistItemDB)
        .filter(
            WatchlistItemDB.userID == user_id,
            WatchlistItemDB.symbol == symbol,
        )
        .first()
    )

    if not item:
        return False

    db.delete(item)
    db.commit()
    return True
