from fastapi import APIRouter, HTTPException, Query, status, Depends
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.auth import _jwt_settings, create_access_token
from app.core.auth_dependencies import get_current_user
from app.core.db_dependencies import get_db
from app.orm_models.user import UserDB
from app.schemas.users import (
    AuthMessage,
    EmailVerificationRequest,
    PasswordForgotRequest,
    PasswordResetRequest,
    Token,
    UserCreate,
    UserOut,
    UserPasswordUpdate,
    UserPreferencesUpdate,
    UserProfileUpdate,
)
from app.services.auth import (
    GoogleAuthError,
    authenticate_user,
    build_frontend_auth_redirect,
    build_google_authorization_url,
    change_user_password,
    exchange_google_code_for_userinfo,
    get_or_create_google_user,
    logout_all_user_sessions,
    register_user,
    request_password_reset,
    reset_password_with_token,
    update_user_profile,
    verify_pending_email_change,
)


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    try:
        raw_password = payload.password
        if hasattr(raw_password, "get_secret_value"):
            raw_password = raw_password.get_secret_value()

        user = register_user(db, payload.email, raw_password, payload.displayName)
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    # Swagger sends email in "username"
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    secret, algorithm, expires = _jwt_settings()
    token = create_access_token(
        data={"sub": user.userID, "sv": int(user.sessionVersion or 1)},
        secret=secret,
        algorithm=algorithm,
        expires_minutes=expires,
    )
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    try:
        return update_user_profile(
            db,
            current_user,
            display_name=payload.displayName,
            email=payload.email,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/me/preferences", response_model=UserOut)
def update_preferences(
    payload: UserPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    if payload.emailNotificationsEnabled is not None:
        current_user.emailNotificationsEnabled = payload.emailNotificationsEnabled

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/password", response_model=AuthMessage)
def update_password(
    payload: UserPasswordUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    try:
        change_user_password(
            db,
            current_user,
            current_password=payload.currentPassword,
            new_password=payload.newPassword,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"message": "Password updated successfully."}


@router.post("/me/logout-all", response_model=AuthMessage)
def logout_all(
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(get_current_user),
):
    logout_all_user_sessions(db, current_user)
    return {"message": "Signed out of all sessions."}


@router.post("/password/forgot", response_model=AuthMessage)
def forgot_password(payload: PasswordForgotRequest, db: Session = Depends(get_db)):
    request_password_reset(db, payload.email)
    return {
        "message": "If an account exists for that email, a password reset link has been sent.",
    }


@router.post("/password/reset", response_model=AuthMessage)
def reset_password(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    try:
        reset_password_with_token(db, payload.token, payload.newPassword)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"message": "Password reset successfully."}


@router.post("/email/verify", response_model=AuthMessage)
def verify_email(payload: EmailVerificationRequest, db: Session = Depends(get_db)):
    try:
        verify_pending_email_change(db, payload.token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"message": "Email verified successfully."}


@router.get("/google/login")
def google_login(
    return_to: str = Query(default="/", alias="returnTo"),
    intent: str = Query(default="login"),
    accepted_terms: bool = Query(default=False, alias="acceptedTerms"),
):
    try:
        redirect_url = build_google_authorization_url(
            return_to,
            intent=intent,
            accepted_terms=accepted_terms,
        )
    except GoogleAuthError as exc:
        redirect_path = "/signup" if intent == "signup" else "/login"
        return RedirectResponse(
            url=build_frontend_auth_redirect(redirect_path, error=str(exc)),
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/google/callback")
async def google_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    fallback_path = "/login"
    try:
        google_userinfo, google_state = await exchange_google_code_for_userinfo(code, state)
        fallback_path = "/signup" if google_state["intent"] == "signup" else "/login"
        user = get_or_create_google_user(
            db,
            email=google_userinfo["email"],
            display_name=google_userinfo.get("name"),
            intent=str(google_state["intent"]),
            accepted_terms=bool(google_state["acceptedTerms"]),
        )
    except GoogleAuthError as exc:
        return RedirectResponse(
            url=build_frontend_auth_redirect(fallback_path, error=str(exc)),
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    secret, algorithm, expires = _jwt_settings()
    token = create_access_token(
        data={"sub": user.userID, "sv": int(user.sessionVersion or 1)},
        secret=secret,
        algorithm=algorithm,
        expires_minutes=expires,
    )
    return RedirectResponse(
        url=build_frontend_auth_redirect(str(google_state["returnTo"]), access_token=token),
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
