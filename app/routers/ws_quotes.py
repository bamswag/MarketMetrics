from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import SessionLocal
from app.core.ws_auth import get_user_from_ws
from app.services.alpha_vantage import AlphaVantageError
from app.services.alert_service import evaluate_alerts_for_quote
from app.services.quote_service import get_quote_cached

router = APIRouter(tags=["WebSocket"])

MAX_TRANSIENT_FAILURES = 3
TRANSIENT_BACKOFF_SECONDS = (5, 15, 30)


def _classify_quote_error(exc: Exception) -> tuple[str, str]:
    message = str(exc) or repr(exc)

    if isinstance(exc, AlphaVantageError):
        lowered = message.lower()
        if "missing alpha_vantage_api_key" in lowered:
            return "fatal", "Server market data is not configured."
        if "returned no price" in lowered or "error message" in lowered:
            return "fatal", "Invalid symbol or no quote data is available."
        if "note" in lowered or "information" in lowered or "http " in lowered:
            return "transient", "Market data provider is temporarily unavailable."

    return "transient", message


@router.websocket("/ws/quotes/{symbol}")
async def ws_quotes(websocket: WebSocket, symbol: str):
    try:
        user = await get_user_from_ws(websocket)
        await websocket.accept()
        symbol = symbol.upper()
        print(f"WS authenticated for user={user.email}, symbol={symbol}")

        poll_seconds = 15
        last_price = None
        transient_failures = 0

        while True:
            try:
                quote = await get_quote_cached(symbol, min_ttl_seconds=poll_seconds)
                transient_failures = 0

                if quote["price"] != last_price:
                    last_price = quote["price"]

                    print(f"Sending quote for {symbol}: {quote}")

                    await websocket.send_json({"type": "quote", "data": quote})
                    db = SessionLocal()
                    try:
                        triggered_alerts = evaluate_alerts_for_quote(
                            db,
                            user.userID,
                            symbol,
                            quote["price"],
                        )
                    finally:
                        db.close()

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
                print(f"Quote fetch/send error: {repr(e)}")
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

            await asyncio.sleep(poll_seconds)

    except WebSocketDisconnect:
        print("WebSocket disconnected by client")
        return
    except Exception as e:
        print(f"Outer WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except RuntimeError:
            pass
        return
