from __future__ import annotations

import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.ws_auth import get_user_from_ws
from app.services.quote_service import get_quote_cached

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/quotes/{symbol}")
async def ws_quotes(websocket: WebSocket, symbol: str):
    await websocket.accept()

    db: Session = SessionLocal()
    try:
        # Authenticate
        _user = get_user_from_ws(websocket, db)

        # IMPORTANT: Alpha Vantage free tier is ~5 requests/minute.
        # If you stream too fast you will get rate-limited.
        poll_seconds = 15

        while True:
            try:
                quote = await get_quote_cached(symbol, min_ttl_seconds=poll_seconds)
                await websocket.send_json({"type": "quote", "data": quote})
            except Exception as e:
                await websocket.send_json({"type": "error", "message": str(e)})

            await asyncio.sleep(poll_seconds)

    except WebSocketDisconnect:
        return
    except Exception as e:
        # auth errors end up here
        await websocket.send_json({"type": "error", "message": str(e)})
    finally:
        db.close()