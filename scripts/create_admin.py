#!/usr/bin/env python3
"""Promote an existing MarketMetrics user to administrator.

The user must register through the application first so authentication fields
are created by the normal signup or OAuth flow. Database configuration is read
from the same environment as the application.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import SessionLocal
from app.orm_models.user import UserDB
from app.services.auth import normalize_email


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Promote an existing MarketMetrics user to administrator.",
    )
    parser.add_argument(
        "--email",
        required=True,
        help="Email address of an existing MarketMetrics user.",
    )
    return parser.parse_args()


def promote_existing_user(email: str) -> bool:
    normalized_email = normalize_email(email)
    db = SessionLocal()
    try:
        user = db.query(UserDB).filter(UserDB.email == normalized_email).first()
        if user is None:
            print(
                "No user exists with that email. Register through MarketMetrics "
                "before running this command.",
                file=sys.stderr,
            )
            return False

        changed = not user.isAdmin or not user.isActive
        user.isAdmin = True
        user.isActive = True
        if changed:
            user.sessionVersion = int(user.sessionVersion or 1) + 1
            db.commit()
            print(f"Promoted and activated {normalized_email}. Sign in again to continue.")
        else:
            print(f"{normalized_email} is already an active administrator.")
        return True
    finally:
        db.close()


if __name__ == "__main__":
    arguments = parse_args()
    raise SystemExit(0 if promote_existing_user(arguments.email) else 1)
