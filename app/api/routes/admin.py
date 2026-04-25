from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.admin_dependencies import get_current_admin_user
from app.core.db_dependencies import get_db
from app.schemas.admin import (
    AdminAuditLogListResponse,
    AdminUserListResponse,
    AdminUserOut,
    AdminUserUpdate,
    SetUserStatusPayload,
)
from app.schemas.users import AuthMessage
from app.services import admin as admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin_user),
):
    return admin_service.list_users(db, search=search, page=page, page_size=pageSize)


@router.get("/users/{userID}", response_model=AdminUserOut)
def get_user(
    userID: str,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin_user),
):
    return admin_service.get_user_by_id_admin(db, userID)


@router.patch("/users/{userID}", response_model=AdminUserOut)
def update_user(
    userID: str,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    user = admin_service.get_user_by_id_admin(db, userID)
    return admin_service.update_user_admin(db, user, payload, admin.userID)


@router.patch("/users/{userID}/status", response_model=AdminUserOut)
def set_user_status(
    userID: str,
    payload: SetUserStatusPayload,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    if userID == admin.userID:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    user = admin_service.get_user_by_id_admin(db, userID)
    return admin_service.set_account_status(db, user, payload.active, admin.userID)


@router.post("/users/{userID}/force-logout", response_model=AdminUserOut)
def force_logout_user(
    userID: str,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    user = admin_service.get_user_by_id_admin(db, userID)
    return admin_service.force_logout(db, user, admin.userID)


@router.post("/users/{userID}/promote", response_model=AdminUserOut)
def promote_user(
    userID: str,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    user = admin_service.get_user_by_id_admin(db, userID)
    return admin_service.promote_user(db, user, admin.userID)


@router.post("/users/{userID}/demote", response_model=AdminUserOut)
def demote_user(
    userID: str,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    if userID == admin.userID:
        raise HTTPException(status_code=400, detail="You cannot demote yourself.")
    user = admin_service.get_user_by_id_admin(db, userID)
    return admin_service.demote_user(db, user, admin.userID)


@router.post("/users/{userID}/resend-verification", response_model=AdminUserOut)
def resend_verification(
    userID: str,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    user = admin_service.get_user_by_id_admin(db, userID)
    return admin_service.resend_verification(db, user, admin.userID)


@router.post("/users/{userID}/send-password-reset", response_model=AuthMessage)
def send_password_reset(
    userID: str,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    user = admin_service.get_user_by_id_admin(db, userID)
    admin_service.send_password_reset_admin(db, user, admin.userID)
    return AuthMessage(message="Password reset email sent.")


@router.delete("/users/{userID}", response_model=AuthMessage)
def delete_user(
    userID: str,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    if userID == admin.userID:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    user = admin_service.get_user_by_id_admin(db, userID)
    admin_service.delete_user(db, user, admin.userID)
    return AuthMessage(message="User deleted.")


@router.get("/audit-logs", response_model=AdminAuditLogListResponse)
def list_audit_logs(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin_user),
):
    return admin_service.list_audit_logs(db, page=page, page_size=pageSize, search=search)
