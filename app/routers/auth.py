import os
from fastapi import APIRouter, HTTPException, status, Depends
from app.models.user import UserCreate, UserLogin, UserOut, Token
from app.services.auth_service import register_user, authenticate_user
from app.core.security import create_access_token
from sqlalchemy.orm import Session
from app.core.db_deps import get_db

router = APIRouter(prefix="/auth", tags=["auth"])


def _jwt_settings():
    secret = os.getenv("JWT_SECRET", "dev_secret")
    algorithm = os.getenv("JWT_ALGORITHM", "HS256")
    expires = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    return secret, algorithm, expires


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    try:
        user = register_user(db, payload.email, payload.password, payload.displayName)
        return user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    secret, algorithm, expires = _jwt_settings()
    token = create_access_token(
        data={"sub": user["email"]},
        secret=secret,
        algorithm=algorithm,
        expires_minutes=expires,
    )
    return {"access_token": token, "token_type": "bearer"}
