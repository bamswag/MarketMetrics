from __future__ import annotations

import logging
import math
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.orm_models.admin_audit_log import AdminAuditLogDB
from app.orm_models.user import UserDB
from app.schemas.admin import AdminAuditLogListResponse, AdminUserListResponse, AdminUserOut, AdminUserUpdate
from app.services.auth import (
    _assign_signup_verification_token,
    _generate_one_time_token,
    _hash_one_time_token,
    _password_reset_expiry,
    _password_reset_url,
    _verification_url,
    _next_session_version,
)
from app.services.email import send_password_reset_email, send_signup_verification_email

logger = logging.getLogger(__name__)


def log_admin_action(
    db: Session,
    admin_user_id: str,
    action: str,
    target_user_id: Optional[str] = None,
    details: Optional[str] = None,
) -> AdminAuditLogDB:
    entry = AdminAuditLogDB(
        id=str(uuid4()),
        adminUserID=admin_user_id,
        targetUserID=target_user_id,
        action=action,
        details=details,
        createdAt=datetime.utcnow(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_users(
    db: Session,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> AdminUserListResponse:
    query = db.query(UserDB)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                UserDB.email.ilike(term),
                UserDB.displayName.ilike(term),
            )
        )
    total = query.count()
    offset = (page - 1) * page_size
    users = query.order_by(UserDB.createdAt.desc()).offset(offset).limit(page_size).all()
    total_pages = max(1, math.ceil(total / page_size))
    return AdminUserListResponse(
        items=[AdminUserOut.model_validate(u) for u in users],
        total=total,
        page=page,
        pageSize=page_size,
        totalPages=total_pages,
    )


def get_user_by_id_admin(db: Session, user_id: str) -> UserDB:
    user = db.query(UserDB).filter(UserDB.userID == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def update_user_admin(
    db: Session,
    user: UserDB,
    payload: AdminUserUpdate,
    admin_user_id: str,
) -> UserDB:
    changes: list[str] = []

    if payload.displayName is not None:
        stripped = payload.displayName.strip()
        if not stripped:
            raise HTTPException(status_code=400, detail="Display name cannot be empty.")
        if stripped != user.displayName:
            user.displayName = stripped
            changes.append("displayName")

    if "emailVerifiedAt" in payload.model_fields_set:
        user.emailVerifiedAt = payload.emailVerifiedAt
        changes.append("emailVerifiedAt")

    if changes:
        db.commit()
        db.refresh(user)
        log_admin_action(
            db,
            admin_user_id=admin_user_id,
            action="update_user",
            target_user_id=user.userID,
            details=f"Updated fields: {', '.join(changes)}",
        )

    return user


def set_account_status(
    db: Session,
    user: UserDB,
    active: bool,
    admin_user_id: str,
) -> UserDB:
    if user.isActive == active:
        return user
    user.isActive = active
    db.commit()
    db.refresh(user)
    action = "activate_user" if active else "deactivate_user"
    log_admin_action(
        db,
        admin_user_id=admin_user_id,
        action=action,
        target_user_id=user.userID,
    )
    return user


def force_logout(db: Session, user: UserDB, admin_user_id: str) -> UserDB:
    user.sessionVersion = _next_session_version(user)
    db.commit()
    db.refresh(user)
    log_admin_action(
        db,
        admin_user_id=admin_user_id,
        action="force_logout",
        target_user_id=user.userID,
    )
    return user


def promote_user(db: Session, user: UserDB, admin_user_id: str) -> UserDB:
    user.isAdmin = True
    db.commit()
    db.refresh(user)
    log_admin_action(
        db,
        admin_user_id=admin_user_id,
        action="promote_to_admin",
        target_user_id=user.userID,
    )
    return user


def demote_user(db: Session, user: UserDB, admin_user_id: str) -> UserDB:
    user.isAdmin = False
    db.commit()
    db.refresh(user)
    log_admin_action(
        db,
        admin_user_id=admin_user_id,
        action="demote_from_admin",
        target_user_id=user.userID,
    )
    return user


def resend_verification(db: Session, user: UserDB, admin_user_id: str) -> UserDB:
    verification_token = _assign_signup_verification_token(user)
    db.commit()
    db.refresh(user)
    send_signup_verification_email(
        user.email,
        user.displayName,
        _verification_url(verification_token),
    )
    log_admin_action(
        db,
        admin_user_id=admin_user_id,
        action="resend_verification",
        target_user_id=user.userID,
    )
    return user


def send_password_reset_admin(db: Session, user: UserDB, admin_user_id: str) -> None:
    token = _generate_one_time_token()
    user.passwordResetTokenHash = _hash_one_time_token(token)
    user.passwordResetTokenExpiresAt = _password_reset_expiry()
    db.commit()
    send_password_reset_email(
        user.email,
        user.displayName,
        _password_reset_url(token),
    )
    log_admin_action(
        db,
        admin_user_id=admin_user_id,
        action="send_password_reset",
        target_user_id=user.userID,
    )


def delete_user(db: Session, user: UserDB, admin_user_id: str) -> None:
    user_id = user.userID
    email = user.email
    db.delete(user)
    db.commit()
    log_admin_action(
        db,
        admin_user_id=admin_user_id,
        action="delete_user",
        target_user_id=user_id,
        details=f"Deleted account: {email}",
    )


def list_audit_logs(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
) -> AdminAuditLogListResponse:
    from app.schemas.admin import AdminAuditLogOut

    query = db.query(AdminAuditLogDB)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AdminAuditLogDB.action.ilike(term),
                AdminAuditLogDB.adminUserID.ilike(term),
                AdminAuditLogDB.targetUserID.ilike(term),
                AdminAuditLogDB.details.ilike(term),
            )
        )
    total = query.count()
    offset = (page - 1) * page_size
    logs = query.order_by(AdminAuditLogDB.createdAt.desc()).offset(offset).limit(page_size).all()
    total_pages = max(1, math.ceil(total / page_size))
    return AdminAuditLogListResponse(
        items=[AdminAuditLogOut.model_validate(entry) for entry in logs],
        total=total,
        page=page,
        pageSize=page_size,
        totalPages=total_pages,
    )
