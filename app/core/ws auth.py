from __future__ import annotations

from fastapi import WebSocket
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.db_deps import get_db
from app.core.security import _jwt_settings
from app.db_models.user import User  # adjust import if your model path differs


def get_user_from_ws(websocket: WebSocket, db: Session) -> User:
    """
    Reads JWT from query param (?token=...) or Authorization header.
    """
    token = websocket.query_params.get("token")

    if not token:
        auth = websocket.headers.get("authorization")
        if auth and auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()

    if not token:
        raise ValueError("Missing token")

    secret, algorithm, _ = _jwt_settings()
    try:
        payload = jwt.decode(token, secret, algorithms=[algorithm])
        email = payload.get("sub")
        if not email:
            raise ValueError("Invalid token payload")
    except JWTError as e:
        raise ValueError("Invalid token") from e

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise ValueError("User not found")

    return user