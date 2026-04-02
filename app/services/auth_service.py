from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.db_models.user import UserDB

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
