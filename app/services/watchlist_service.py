import asyncio

from sqlalchemy.orm import Session

from app.db_models.watchlist_item import WatchlistItemDB
from app.models.watchlist import (
    WatchlistAlertSummaryOut,
    WatchlistItemDetailedOut,
    WatchlistQuoteOut,
)
from app.services.alert_service import list_alerts_for_symbols
from app.services.quote_service import get_quote_cached


def add_watchlist_item(db: Session, user_id: str, symbol: str) -> WatchlistItemDB:
    symbol = symbol.strip().upper()

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
    symbols = [item.symbol for item in items]
    alerts = list_alerts_for_symbols(db, user_id, symbols)

    alerts_by_symbol: dict[str, list] = {}
    for alert in alerts:
        alerts_by_symbol.setdefault(alert.symbol, []).append(alert)

    quotes = await asyncio.gather(
        *[get_quote_for_watchlist_item(item.symbol) for item in items]
    )

    detailed_items: list[WatchlistItemDetailedOut] = []
    for item, quote in zip(items, quotes):
        symbol_alerts = alerts_by_symbol.get(item.symbol, [])
        active_alerts = sum(1 for alert in symbol_alerts if alert.isActive)
        triggered_alerts = sum(
            1 for alert in symbol_alerts if not alert.isActive and alert.triggeredAt is not None
        )

        detailed_items.append(
            WatchlistItemDetailedOut(
                id=item.id,
                userID=item.userID,
                symbol=item.symbol,
                createdAt=item.createdAt,
                latestQuote=quote,
                alerts=WatchlistAlertSummaryOut(
                    totalAlerts=len(symbol_alerts),
                    activeAlerts=active_alerts,
                    triggeredAlerts=triggered_alerts,
                ),
            )
        )

    return detailed_items


async def get_quote_for_watchlist_item(symbol: str) -> WatchlistQuoteOut:
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
    symbol = symbol.strip().upper()

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
