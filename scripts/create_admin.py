#!/usr/bin/env python3
"""One-time script to create or promote the admin account."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import SessionLocal
from app.orm_models.user import UserDB
from app.core.auth import hash_password
from datetime import datetime
from uuid import uuid4

ADMIN_EMAIL = "admin@marketmetrics.dev"
ADMIN_PASSWORD = "password123"
ADMIN_DISPLAY_NAME = "MarketMetrics Admin"

def create_or_promote_admin():
    db = SessionLocal()
    try:
        user = db.query(UserDB).filter(UserDB.email == ADMIN_EMAIL).first()
        if user:
            user.isAdmin = True
            user.isActive = True
            db.commit()
            print(f"Promoted existing user {ADMIN_EMAIL} to admin.")
        else:
            user = UserDB(
                userID=str(uuid4()),
                email=ADMIN_EMAIL,
                passwordHash=hash_password(ADMIN_PASSWORD),
                displayName=ADMIN_DISPLAY_NAME,
                primaryAuthProvider="password",
                passwordAuthEnabled=True,
                isAdmin=True,
                isActive=True,
                emailVerifiedAt=datetime.utcnow(),
                sessionVersion=1,
                createdAt=datetime.utcnow(),
            )
            db.add(user)
            db.commit()
            print(f"Created admin account: {ADMIN_EMAIL}")
    finally:
        db.close()

if __name__ == "__main__":
    create_or_promote_admin()
