from datetime import datetime
from secrets import token_urlsafe
from typing import Optional
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session

from app.core.auth import _jwt_settings, create_access_token, decode_access_token, hash_password, verify_password
from app.core.config import settings
from app.orm_models.user import UserDB

GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


class GoogleAuthError(ValueError):
    pass


def register_user(db: Session, email: str, password: str, display_name: str) -> UserDB:
    existing = db.query(UserDB).filter(UserDB.email == email).first()
    if existing:
        raise ValueError("Email already registered")

    user = UserDB(
        userID=str(uuid4()),
        email=email,
        passwordHash=hash_password(password),
        displayName=display_name,
        createdAt=datetime.utcnow(),
        lastLoginAt=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> Optional[UserDB]:
    user = db.query(UserDB).filter(UserDB.email == email).first()
    if not user:
        return None

    if not verify_password(password, user.passwordHash):
        return None

    user.lastLoginAt = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> Optional[UserDB]:
    return db.query(UserDB).filter(UserDB.email == email).first()


def _require_google_oauth_config() -> None:
    if not settings.google_client_id or not settings.google_client_secret:
        raise GoogleAuthError("Google login is not configured on this server.")


def _normalize_return_to(return_to: Optional[str]) -> str:
    if not return_to or not return_to.startswith("/") or return_to.startswith("//"):
        return "/"
    return return_to


def _build_google_state_token(return_to: Optional[str]) -> str:
    _require_google_oauth_config()
    secret, algorithm, _ = _jwt_settings()
    return create_access_token(
        data={
            "purpose": "google_oauth",
            "returnTo": _normalize_return_to(return_to),
        },
        secret=secret,
        algorithm=algorithm,
        expires_minutes=10,
    )


def build_google_authorization_url(return_to: Optional[str] = "/") -> str:
    state_token = _build_google_state_token(return_to)
    params = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_oauth_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "prompt": "select_account",
            "state": state_token,
        }
    )
    return f"{GOOGLE_AUTHORIZATION_URL}?{params}"


def build_frontend_auth_redirect(
    return_to: Optional[str] = "/",
    *,
    access_token: Optional[str] = None,
    error: Optional[str] = None,
) -> str:
    base_url = settings.frontend_base_url.rstrip("/")
    path = _normalize_return_to(return_to)
    fragment_params: dict[str, str] = {}

    if access_token:
        fragment_params["token"] = access_token
    if error:
        fragment_params["authError"] = error

    fragment = urlencode(fragment_params)
    return f"{base_url}{path}" + (f"#{fragment}" if fragment else "")


def _decode_google_state_token(state_token: str) -> str:
    try:
        payload = decode_access_token(state_token)
    except ValueError as exc:
        raise GoogleAuthError("Google login request expired. Please try again.") from exc

    if payload.get("purpose") != "google_oauth":
        raise GoogleAuthError("Google login request is invalid. Please try again.")

    return _normalize_return_to(payload.get("returnTo"))


async def exchange_google_code_for_userinfo(code: str, state_token: str) -> tuple[dict, str]:
    _require_google_oauth_config()
    return_to = _decode_google_state_token(state_token)

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            token_response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.google_oauth_redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={"Accept": "application/json"},
            )
            token_response.raise_for_status()
            token_payload = token_response.json()

            access_token = token_payload.get("access_token")
            if not access_token:
                raise GoogleAuthError("Google login did not return an access token.")

            userinfo_response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
            )
            userinfo_response.raise_for_status()
            userinfo = userinfo_response.json()
        except httpx.HTTPError as exc:
            raise GoogleAuthError("Unable to complete Google login. Please try again.") from exc

    email = userinfo.get("email")
    email_verified = userinfo.get("email_verified")

    if not email or email_verified not in (True, "true", "True", 1):
        raise GoogleAuthError("Google account email is unavailable or unverified.")

    return userinfo, return_to


def get_or_create_google_user(db: Session, email: str, display_name: Optional[str]) -> UserDB:
    user = get_user_by_email(db, email)
    now = datetime.utcnow()

    if user:
        user.lastLoginAt = now
        if display_name and not user.displayName:
            user.displayName = display_name
        db.commit()
        db.refresh(user)
        return user

    user = UserDB(
        userID=str(uuid4()),
        email=email,
        passwordHash=hash_password(token_urlsafe(32)),
        displayName=display_name or email.split("@")[0],
        createdAt=now,
        lastLoginAt=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
