from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta
from secrets import token_urlsafe
from typing import Optional
from urllib.parse import quote, urlencode, urlparse
from uuid import uuid4

import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

import app.orm_models  # noqa: F401
from app.core.auth import (
    _jwt_settings,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.core.config import settings
from app.core.database import ensure_local_sqlite_schema
from app.orm_models.user import UserDB
from app.services.email import (
    send_email_change_verification_email,
    send_password_reset_email,
    send_welcome_email,
)

GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

logger = logging.getLogger(__name__)


class GoogleAuthError(ValueError):
    pass


def normalize_email(email: str) -> str:
    return email.strip().lower()


def ensure_user_schema(bind) -> None:
    ensure_local_sqlite_schema(bind)


def get_user_by_email(db: Session, email: str) -> Optional[UserDB]:
    ensure_user_schema(db.get_bind())
    return db.query(UserDB).filter(UserDB.email == normalize_email(email)).first()


def get_user_by_id(db: Session, user_id: str) -> Optional[UserDB]:
    ensure_user_schema(db.get_bind())
    return db.query(UserDB).filter(UserDB.userID == user_id).first()


def _generate_one_time_token() -> str:
    return token_urlsafe(32)


def _hash_one_time_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _password_reset_url(token: str) -> str:
    token_path = quote(token.strip(), safe="")
    return f"{settings.frontend_base_url}/reset-password/{token_path}"


def _email_verification_url(token: str) -> str:
    token_path = quote(token.strip(), safe="")
    return f"{settings.frontend_base_url}/verify-email/{token_path}"


def _next_session_version(user: UserDB) -> int:
    return int(user.sessionVersion or 1) + 1


def _password_reset_expiry() -> datetime:
    return datetime.utcnow() + timedelta(minutes=settings.password_reset_token_expire_minutes)


def _email_verification_expiry() -> datetime:
    return datetime.utcnow() + timedelta(
        minutes=settings.email_verification_token_expire_minutes,
    )


def _resolve_frontend_origin(frontend_origin: Optional[str]) -> str:
    if frontend_origin is None:
        return settings.frontend_base_url.rstrip("/")

    normalized_origin = frontend_origin.strip().rstrip("/")
    parsed = urlparse(normalized_origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise GoogleAuthError("Frontend origin is invalid.")

    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in settings.allowed_frontend_origins:
        raise GoogleAuthError("Frontend origin is not allowed.")

    return origin


def resolve_google_redirect_uri(request_origin: Optional[str] = None) -> str:
    if request_origin is not None:
        normalized_origin = request_origin.strip().rstrip("/")
        parsed = urlparse(normalized_origin)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise GoogleAuthError("Backend origin is invalid.")
        return f"{parsed.scheme}://{parsed.netloc}/auth/google/callback"

    return settings.google_oauth_redirect_uri.strip()


def register_user(db: Session, email: str, password: str, display_name: str) -> UserDB:
    ensure_user_schema(db.get_bind())

    normalized_email = normalize_email(email)
    existing = db.query(UserDB).filter(UserDB.email == normalized_email).first()
    if existing:
        raise ValueError("Email already registered")

    now = datetime.utcnow()
    user = UserDB(
        userID=str(uuid4()),
        email=normalized_email,
        passwordHash=hash_password(password),
        displayName=display_name.strip(),
        primaryAuthProvider="password",
        passwordAuthEnabled=True,
        emailVerifiedAt=now,
        sessionVersion=1,
        createdAt=now,
        lastLoginAt=None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    send_welcome_email(user.email, user.displayName)
    return user


def authenticate_user(db: Session, email: str, password: str) -> Optional[UserDB]:
    ensure_user_schema(db.get_bind())

    user = db.query(UserDB).filter(UserDB.email == normalize_email(email)).first()
    if not user:
        return None

    if not user.passwordAuthEnabled:
        return None

    if not verify_password(password, user.passwordHash):
        return None

    user.lastLoginAt = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user


def update_user_profile(
    db: Session,
    current_user: UserDB,
    *,
    display_name: Optional[str] = None,
    email: Optional[str] = None,
) -> UserDB:
    ensure_user_schema(db.get_bind())

    next_display_name = display_name.strip() if display_name is not None else None
    if display_name is not None and not next_display_name:
        raise ValueError("Display name cannot be empty.")

    pending_verification_email: Optional[str] = None
    verification_url: Optional[str] = None
    updated = False

    if next_display_name and next_display_name != current_user.displayName:
        current_user.displayName = next_display_name
        updated = True

    if email is not None:
        normalized_email = normalize_email(email)
        if not normalized_email:
            raise ValueError("Email address cannot be empty.")

        should_issue_pending_email = (
            normalized_email != current_user.email
            or current_user.pendingEmail == normalized_email
        )

        if should_issue_pending_email:
            conflict = (
                db.query(UserDB)
                .filter(
                    UserDB.userID != current_user.userID,
                    or_(
                        UserDB.email == normalized_email,
                        UserDB.pendingEmail == normalized_email,
                    ),
                )
                .first()
            )
            if conflict:
                raise ValueError("That email address is already in use.")

            token = _generate_one_time_token()
            current_user.pendingEmail = normalized_email
            current_user.pendingEmailTokenHash = _hash_one_time_token(token)
            current_user.pendingEmailTokenExpiresAt = _email_verification_expiry()
            pending_verification_email = normalized_email
            verification_url = _email_verification_url(token)
            updated = True

    if not updated:
        return current_user

    db.commit()
    db.refresh(current_user)

    if pending_verification_email and verification_url:
        send_email_change_verification_email(
            pending_verification_email,
            current_user.displayName,
            verification_url,
        )

    return current_user


def change_user_password(
    db: Session,
    current_user: UserDB,
    *,
    current_password: Optional[str],
    new_password: str,
) -> None:
    ensure_user_schema(db.get_bind())

    if current_user.passwordAuthEnabled:
        if not current_password:
            raise ValueError("Enter your current password to continue.")
        if not verify_password(current_password, current_user.passwordHash):
            raise ValueError("Current password is incorrect.")

    if verify_password(new_password, current_user.passwordHash):
        raise ValueError("Choose a password that is different from your current one.")

    current_user.passwordHash = hash_password(new_password)
    current_user.passwordAuthEnabled = True
    current_user.sessionVersion = _next_session_version(current_user)
    current_user.passwordResetTokenHash = None
    current_user.passwordResetTokenExpiresAt = None
    db.commit()


def logout_all_user_sessions(db: Session, current_user: UserDB) -> None:
    ensure_user_schema(db.get_bind())

    current_user.sessionVersion = _next_session_version(current_user)
    db.commit()


def request_password_reset(db: Session, email: str) -> None:
    ensure_user_schema(db.get_bind())

    normalized_email = normalize_email(email)
    user = db.query(UserDB).filter(UserDB.email == normalized_email).first()
    if not user:
        logger.warning("Password reset requested for non-existent account: %s", normalized_email)
        return

    token = _generate_one_time_token()
    user.passwordResetTokenHash = _hash_one_time_token(token)
    user.passwordResetTokenExpiresAt = _password_reset_expiry()
    db.commit()

    logger.warning(
        "Password reset token created for %s; expires at %s",
        user.email,
        user.passwordResetTokenExpiresAt,
    )

    email_sent = send_password_reset_email(
        user.email,
        user.displayName,
        _password_reset_url(token),
    )
    if email_sent:
        logger.warning("Password reset email delivery accepted for %s", user.email)
    else:
        logger.warning("Password reset email delivery was not accepted for %s", user.email)


def reset_password_with_token(db: Session, token: str, new_password: str) -> None:
    ensure_user_schema(db.get_bind())

    token_hash = _hash_one_time_token(token)
    now = datetime.utcnow()
    user = (
        db.query(UserDB)
        .filter(
            UserDB.passwordResetTokenHash == token_hash,
            UserDB.passwordResetTokenExpiresAt.is_not(None),
            UserDB.passwordResetTokenExpiresAt >= now,
        )
        .first()
    )
    if not user:
        raise ValueError("Password reset link is invalid or expired.")

    if verify_password(new_password, user.passwordHash):
        raise ValueError("Choose a password that is different from your current one.")

    user.passwordHash = hash_password(new_password)
    user.passwordAuthEnabled = True
    user.passwordResetTokenHash = None
    user.passwordResetTokenExpiresAt = None
    user.sessionVersion = _next_session_version(user)
    db.commit()


def verify_pending_email_change(db: Session, token: str) -> UserDB:
    ensure_user_schema(db.get_bind())

    token_hash = _hash_one_time_token(token)
    now = datetime.utcnow()
    user = (
        db.query(UserDB)
        .filter(
            UserDB.pendingEmailTokenHash == token_hash,
            UserDB.pendingEmailTokenExpiresAt.is_not(None),
            UserDB.pendingEmailTokenExpiresAt >= now,
        )
        .first()
    )
    if not user or not user.pendingEmail:
        raise ValueError("Email verification link is invalid or expired.")

    normalized_pending_email = normalize_email(user.pendingEmail)
    conflict = (
        db.query(UserDB)
        .filter(
            UserDB.userID != user.userID,
            UserDB.email == normalized_pending_email,
        )
        .first()
    )
    if conflict:
        raise ValueError("That email address is already in use.")

    user.email = normalized_pending_email
    user.emailVerifiedAt = now
    user.pendingEmail = None
    user.pendingEmailTokenHash = None
    user.pendingEmailTokenExpiresAt = None
    db.commit()
    db.refresh(user)
    return user


def _require_google_oauth_config() -> None:
    if not settings.google_client_id or not settings.google_client_secret:
        raise GoogleAuthError("Google login is not configured on this server.")


def _normalize_return_to(return_to: Optional[str]) -> str:
    if not return_to or not return_to.startswith("/") or return_to.startswith("//"):
        return "/"
    return return_to


def _build_google_state_token(
    return_to: Optional[str],
    *,
    intent: str = "login",
    accepted_terms: bool = False,
    frontend_origin: Optional[str] = None,
) -> str:
    _require_google_oauth_config()
    resolved_frontend_origin = _resolve_frontend_origin(frontend_origin)
    secret, algorithm, _ = _jwt_settings()
    return create_access_token(
        data={
            "purpose": "google_oauth",
            "returnTo": _normalize_return_to(return_to),
            "intent": "signup" if intent == "signup" else "login",
            "acceptedTerms": bool(accepted_terms),
            "frontendOrigin": resolved_frontend_origin,
        },
        secret=secret,
        algorithm=algorithm,
        expires_minutes=10,
    )


def build_google_authorization_url(
    return_to: Optional[str] = "/",
    *,
    intent: str = "login",
    accepted_terms: bool = False,
    frontend_origin: Optional[str] = None,
    request_origin: Optional[str] = None,
) -> str:
    redirect_uri = resolve_google_redirect_uri(request_origin)
    state_token = _build_google_state_token(
        return_to,
        intent=intent,
        accepted_terms=accepted_terms,
        frontend_origin=frontend_origin,
    )
    params = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": redirect_uri,
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
    frontend_origin: Optional[str] = None,
) -> str:
    base_url = _resolve_frontend_origin(frontend_origin)
    path = _normalize_return_to(return_to)
    fragment_params: dict[str, str] = {}

    if access_token:
        fragment_params["token"] = access_token
    if error:
        fragment_params["authError"] = error

    fragment = urlencode(fragment_params)
    return f"{base_url}{path}" + (f"#{fragment}" if fragment else "")


def _decode_google_state_token(state_token: str) -> dict[str, object]:
    try:
        payload = decode_access_token(state_token)
    except ValueError as exc:
        raise GoogleAuthError("Google login request expired. Please try again.") from exc

    if payload.get("purpose") != "google_oauth":
        raise GoogleAuthError("Google login request is invalid. Please try again.")

    intent = "signup" if payload.get("intent") == "signup" else "login"
    accepted_terms = payload.get("acceptedTerms") in (True, "true", "True", 1, "1")
    return {
        "returnTo": _normalize_return_to(payload.get("returnTo")),
        "intent": intent,
        "acceptedTerms": accepted_terms,
        "frontendOrigin": _resolve_frontend_origin(payload.get("frontendOrigin"))
        if payload.get("frontendOrigin") is not None
        else settings.frontend_base_url.rstrip("/"),
    }


async def exchange_google_code_for_userinfo(
    code: str,
    state_token: str,
    request_origin: Optional[str] = None,
) -> tuple[dict, dict[str, object]]:
    _require_google_oauth_config()
    google_state = _decode_google_state_token(state_token)
    redirect_uri = resolve_google_redirect_uri(request_origin)

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            token_response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": redirect_uri,
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
    google_subject = userinfo.get("sub")

    if not email or email_verified not in (True, "true", "True", 1):
        raise GoogleAuthError("Google account email is unavailable or unverified.")
    if not google_subject:
        raise GoogleAuthError("Google account identifier is unavailable.")

    return userinfo, google_state


def get_or_create_google_user(
    db: Session,
    *,
    google_subject: str,
    email: str,
    display_name: Optional[str],
    intent: str = "login",
    accepted_terms: bool = False,
) -> UserDB:
    ensure_user_schema(db.get_bind())

    normalized_google_subject = google_subject.strip()
    if not normalized_google_subject:
        raise GoogleAuthError("Google account identifier is unavailable.")

    normalized_email = normalize_email(email)
    now = datetime.utcnow()

    user = db.query(UserDB).filter(UserDB.googleSubject == normalized_google_subject).first()
    if user:
        user.lastLoginAt = now
        user.emailVerifiedAt = user.emailVerifiedAt or now
        if display_name and not user.displayName:
            user.displayName = display_name
        db.commit()
        db.refresh(user)
        return user

    user = db.query(UserDB).filter(UserDB.email == normalized_email).first()
    if user:
        if user.googleSubject and user.googleSubject != normalized_google_subject:
            raise GoogleAuthError("This MarketMetrics account is already linked to a different Google account.")
        user.googleSubject = normalized_google_subject
        user.lastLoginAt = now
        user.emailVerifiedAt = user.emailVerifiedAt or now
        if not user.passwordAuthEnabled:
            user.primaryAuthProvider = "google"
        if display_name and not user.displayName:
            user.displayName = display_name
        db.commit()
        db.refresh(user)
        return user

    if intent != "signup":
        raise GoogleAuthError("No MarketMetrics account is linked to this Google login. Start from Sign up.")

    if not accepted_terms:
        raise GoogleAuthError("Agree to the Terms and Privacy Policy before creating your account.")

    user = UserDB(
        userID=str(uuid4()),
        email=normalized_email,
        passwordHash=hash_password(token_urlsafe(32)),
        displayName=(display_name or normalized_email.split("@")[0]).strip(),
        primaryAuthProvider="google",
        passwordAuthEnabled=False,
        googleSubject=normalized_google_subject,
        emailVerifiedAt=now,
        sessionVersion=1,
        createdAt=now,
        lastLoginAt=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    send_welcome_email(user.email, user.displayName)
    return user
