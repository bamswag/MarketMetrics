from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.auth import decode_access_token
from app.core.db_dependencies import get_db
from app.services.auth import get_user_by_id

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    try:
        payload = decode_access_token(token)
        user_id: Optional[str] = payload.get("sub")
        session_version = payload.get("sv")
        if not user_id or session_version is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        user = get_user_by_id(db, user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        if int(user.sessionVersion or 1) != int(session_version):
            raise HTTPException(status_code=401, detail="Session expired")

        return user

    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


def get_optional_current_user(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
):
    """Returns the current user if a valid token is present, otherwise None."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id: Optional[str] = payload.get("sub")
        session_version = payload.get("sv")
        if not user_id or session_version is None:
            return None
        user = get_user_by_id(db, user_id)
        if user is None:
            return None
        if int(user.sessionVersion or 1) != int(session_version):
            return None
        return user
    except Exception:
        return None
