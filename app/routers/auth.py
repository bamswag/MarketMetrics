import os
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordRequestForm
from app.models.user import UserCreate, UserLogin, UserOut, Token
from app.services.auth_service import register_user, authenticate_user
from app.core.security import create_access_token
from app.core.db_deps import get_db
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.db_deps import get_db
from app.services.auth_service import authenticate_user


router = APIRouter(prefix="/auth", tags=["auth"])


def _jwt_settings():
    secret = os.getenv("JWT_SECRET", "dev_secret")
    algorithm = os.getenv("JWT_ALGORITHM", "HS256")
    expires = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    return secret, algorithm, expires


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
