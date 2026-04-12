from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import SessionLocal
from app.core.websocket_auth import get_user_from_ws
from app.integrations.alpaca.client import AlpacaMarketDataError
from app.services.alerts import evaluate_alerts_for_quote
from app.services.quotes import get_quote_cached

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

MAX_TRANSIENT_FAILURES = 3
TRANSIENT_BACKOFF_SECONDS = (5, 15, 30)
POLL_SECONDS = 30
QUOTE_CACHE_TTL_SECONDS = 20


def _evaluate_alerts_sync(user_id: str, symbol: str, price: float):
    """Run alert evaluation in a worker thread with a short-lived session."""
    db = SessionLocal()
    try:
        return evaluate_alerts_for_quote(db, user_id, symbol, price)
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


@router.websocket("/ws/quotes/{symbol}")
async def ws_quotes(websocket: WebSocket, symbol: str):
    accepted = False
    try:
        user = await get_user_from_ws(websocket)
        await websocket.accept()
        accepted = True
        symbol = symbol.upper()
        logger.info("WS authenticated user=%s symbol=%s", user.email, symbol)

        last_price = None
        transient_failures = 0

        while True:
            try:
                quote = await get_quote_cached(
                    symbol, min_ttl_seconds=QUOTE_CACHE_TTL_SECONDS
                )
                transient_failures = 0

                if quote["price"] != last_price:
                    last_price = quote["price"]

                    logger.debug("Sending quote for %s: %s", symbol, quote)

                    await websocket.send_json({"type": "quote", "data": quote})
                    triggered_alerts = await asyncio.to_thread(
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
                                    "id": alert.id,
                                    "symbol": alert.symbol,
                                    "condition": alert.condition,
                                    "targetPrice": alert.targetPrice,
                                    "triggeredAt": alert.triggeredAt.isoformat()
                                    if alert.triggeredAt
                                    else None,
                                },
                            }
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
