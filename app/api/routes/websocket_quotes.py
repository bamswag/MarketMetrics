from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import SessionLocal
from app.core.websocket_auth import WEBSOCKET_AUTH_SUBPROTOCOL, get_user_from_ws
from app.integrations.alpaca.client import AlpacaMarketDataError
from app.services.alerts import evaluate_alerts_for_quote
from app.services.email import send_alert_email
from app.services.quotes import get_quote_cached

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

MAX_TRANSIENT_FAILURES = 3
TRANSIENT_BACKOFF_SECONDS = (5, 15, 30)
POLL_SECONDS = 30
QUOTE_CACHE_TTL_SECONDS = 20
MAX_CONNECTION_SECONDS = 1800  # force-close connections open longer than 30 minutes


def _accepted_websocket_subprotocol(websocket: WebSocket) -> Optional[str]:
    header_value = websocket.headers.get("sec-websocket-protocol", "")
    requested = {item.strip() for item in header_value.split(",") if item.strip()}
    if WEBSOCKET_AUTH_SUBPROTOCOL in requested:
        return WEBSOCKET_AUTH_SUBPROTOCOL
    return None


def _evaluate_alerts_sync(user_id: str, symbol: str, price: float):
    """Run alert evaluation in a worker thread with a short-lived session.

    All data is extracted into plain dicts before the session closes so that
    nothing tries to touch the DB after the connection is returned to the pool
    (avoids DetachedInstanceError).
    """
    db = SessionLocal()
    try:
        triggered = evaluate_alerts_for_quote(db, user_id, symbol, price)

        # Serialise ORM objects to plain dicts while the session is still open.
        triggered_data = [
            {
                "id": alert.id,
                "symbol": alert.symbol,
                "condition": alert.condition,
                "targetPrice": alert.targetPrice,
                "severity": alert.severity or "normal",
                "triggeredAt": alert.triggeredAt.isoformat() if alert.triggeredAt else None,
            }
            for alert in triggered
        ]

        user_email = None
        email_enabled = False
        if triggered_data:
            from app.orm_models.user import UserDB
            user = db.query(UserDB).filter(UserDB.userID == user_id).first()
            if user:
                user_email = user.email
                email_enabled = bool(user.emailNotificationsEnabled)

        return triggered_data, user_email, email_enabled
    finally:
        db.close()


def _classify_quote_error(exc: Exception) -> tuple[str, str]:
    message = str(exc) or repr(exc)

    if isinstance(exc, AlpacaMarketDataError):
        lowered = message.lower()
        if "missing alpaca_api_key" in lowered or "missing alpaca_secret_key" in lowered:
            return "fatal", "Server market data is not configured."
        if "no quote data" in lowered or "no historical bar data" in lowered:
            return "fatal", "Invalid symbol or no quote data is available."
        if "http " in lowered:
            return "transient", "Market data provider is temporarily unavailable."

    return "transient", message


@router.websocket("/ws/quotes/{symbol:path}")
async def ws_quotes(websocket: WebSocket, symbol: str):
    accepted = False
    try:
        user = await get_user_from_ws(websocket)
        accepted_subprotocol = _accepted_websocket_subprotocol(websocket)
        if accepted_subprotocol:
            await websocket.accept(subprotocol=accepted_subprotocol)
        else:
            await websocket.accept()
        accepted = True
        symbol = symbol.upper()
        logger.info("WS authenticated user=%s symbol=%s", user.email, symbol)

        last_price = None
        transient_failures = 0
        connection_opened_at = asyncio.get_event_loop().time()

        while True:
            if asyncio.get_event_loop().time() - connection_opened_at > MAX_CONNECTION_SECONDS:
                logger.info("WS max lifetime reached for user=%s symbol=%s — closing", user.email, symbol)
                await websocket.close(code=1001, reason="Connection lifetime limit reached. Reconnect to continue.")
                return

            try:
                quote = await get_quote_cached(
                    symbol, min_ttl_seconds=QUOTE_CACHE_TTL_SECONDS
                )
                transient_failures = 0

                if quote["price"] != last_price:
                    last_price = quote["price"]

                    logger.debug("Sending quote for %s: %s", symbol, quote)

                    await websocket.send_json({"type": "quote", "data": quote})
                    triggered_alerts, user_email, email_enabled = await asyncio.to_thread(
                        _evaluate_alerts_sync,
                        user.userID,
                        symbol,
                        quote["price"],
                    )

                    for alert in triggered_alerts:
                        await websocket.send_json(
                            {
                                "type": "alert_triggered",
                                "data": {
                                    "id": alert["id"],
                                    "symbol": alert["symbol"],
                                    "condition": alert["condition"],
                                    "targetPrice": alert["targetPrice"],
                                    "severity": alert["severity"],
                                    "triggeredAt": alert["triggeredAt"],
                                },
                            }
                        )

                        if email_enabled and user_email:
                            try:
                                await asyncio.to_thread(
                                    send_alert_email,
                                    user_email,
                                    alert["symbol"],
                                    alert["condition"],
                                    alert["targetPrice"],
                                    quote["price"],
                                    alert["severity"],
                                )
                            except Exception:
                                logger.exception(
                                    "Email send failed for alert %s, continuing",
                                    alert["id"],
                                )
            except Exception as e:
                logger.warning("Quote fetch/send error: %r", e)
                error_kind, client_message = _classify_quote_error(e)

                if error_kind == "fatal":
                    try:
                        await websocket.send_json({"type": "error", "message": client_message})
                    except RuntimeError:
                        return
                    await websocket.close(code=1011, reason=client_message[:120])
                    return

                transient_failures += 1
                retry_delay = TRANSIENT_BACKOFF_SECONDS[
                    min(transient_failures - 1, len(TRANSIENT_BACKOFF_SECONDS) - 1)
                ]

                try:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": client_message,
                            "retryInSeconds": retry_delay,
                            "attempt": transient_failures,
                        }
                    )
                except RuntimeError:
                    return

                if transient_failures >= MAX_TRANSIENT_FAILURES:
                    await websocket.close(
                        code=1013,
                        reason="Quote stream unavailable after repeated upstream failures.",
                    )
                    return

                await asyncio.sleep(retry_delay)
                continue

            await asyncio.sleep(POLL_SECONDS)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by client")
        return
    except Exception as e:
        logger.error("Outer WebSocket error: %s", e)
        if accepted:
            try:
                await websocket.send_json({"type": "error", "message": str(e)})
            except RuntimeError:
                pass
        return
