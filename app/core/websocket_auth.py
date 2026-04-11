from fastapi import WebSocket

from app.core.auth import decode_access_token
from app.core.database import SessionLocal
from app.orm_models.user import UserDB

async def get_user_from_ws(websocket: WebSocket) -> UserDB:
    """
    Accepts token via:
      - ?token=...
      - Authorization: Bearer ...
    """
    token = websocket.query_params.get("token")

    if not token:
        auth = websocket.headers.get("authorization")
        if auth and auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()

    if not token:
        await websocket.close(code=4401)
        raise RuntimeError("Missing token")

    try:
        payload = decode_access_token(token)
        email = payload.get("sub")
        if not email:
            await websocket.close(code=4401)
            raise RuntimeError("Token missing sub")
    except ValueError:
        await websocket.close(code=4401)
        raise RuntimeError("Invalid token")

    db = SessionLocal()
    try:
        user = db.query(UserDB).filter(UserDB.email == email).first()
        if not user:
            await websocket.close(code=4404)
            raise RuntimeError("User not found")
        return user
    finally:
        db.close()
