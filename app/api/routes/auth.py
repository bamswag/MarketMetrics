from fastapi import APIRouter, HTTPException, Query, status, Depends
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.auth import _jwt_settings, create_access_token
from app.core.auth_dependencies import get_current_user
from app.core.db_dependencies import get_db
from app.schemas.users import Token, UserCreate, UserOut
from app.services.auth import (
    GoogleAuthError,
    authenticate_user,
    build_frontend_auth_redirect,
    build_google_authorization_url,
    exchange_google_code_for_userinfo,
    get_or_create_google_user,
    register_user,
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
        data={"sub": user.email},
        secret=secret,
        algorithm=algorithm,
        expires_minutes=expires,
    )
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.get("/google/login")
def google_login(return_to: str = Query(default="/", alias="returnTo")):
    try:
        redirect_url = build_google_authorization_url(return_to)
    except GoogleAuthError as exc:
        return RedirectResponse(
            url=build_frontend_auth_redirect(return_to, error=str(exc)),
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/google/callback")
async def google_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    try:
        google_userinfo, return_to = await exchange_google_code_for_userinfo(code, state)
        user = get_or_create_google_user(
            db,
            email=google_userinfo["email"],
            display_name=google_userinfo.get("name"),
        )
    except GoogleAuthError as exc:
        return RedirectResponse(
            url=build_frontend_auth_redirect("/", error=str(exc)),
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    secret, algorithm, expires = _jwt_settings()
    token = create_access_token(
        data={"sub": user.email},
        secret=secret,
        algorithm=algorithm,
        expires_minutes=expires,
    )
    return RedirectResponse(
        url=build_frontend_auth_redirect(return_to, access_token=token),
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
