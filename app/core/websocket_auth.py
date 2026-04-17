from typing import Optional

from fastapi import WebSocket

from app.core.auth import decode_access_token
from app.core.database import SessionLocal
from app.orm_models.user import UserDB
from app.services.auth import ensure_user_schema, get_user_by_id

WEBSOCKET_AUTH_SUBPROTOCOL = "marketmetrics.jwt.v1"


def _get_token_from_subprotocols(websocket: WebSocket) -> Optional[str]:
    header_value = websocket.headers.get("sec-websocket-protocol", "")
    if not header_value:
        return None

    for protocol in [item.strip() for item in header_value.split(",") if item.strip()]:
        if protocol.startswith("bearer."):
            return protocol[len("bearer."):]

    return None

async def get_user_from_ws(websocket: WebSocket) -> UserDB:
    """
    Accepts token via:
      - ?token=...
      - Authorization: Bearer ...
      - Sec-WebSocket-Protocol: marketmetrics.jwt.v1, bearer.<token>
    """
    token = websocket.query_params.get("token")

    if not token:
        auth = websocket.headers.get("authorization")
        if auth and auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()

    if not token:
        token = _get_token_from_subprotocols(websocket)

    if not token:
        await websocket.close(code=4401)
        raise RuntimeError("Missing token")

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        session_version = payload.get("sv")
        if not user_id or session_version is None:
            await websocket.close(code=4401)
            raise RuntimeError("Token missing sub")
    except ValueError:
        await websocket.close(code=4401)
        raise RuntimeError("Invalid token")

    db = SessionLocal()
    try:
        ensure_user_schema(db.get_bind())
        user = get_user_by_id(db, user_id)
        if not user:
            await websocket.close(code=4404)
            raise RuntimeError("User not found")
        if int(user.sessionVersion or 1) != int(session_version):
            await websocket.close(code=4401)
            raise RuntimeError("Session expired")
        return user
    finally:
        db.close()
