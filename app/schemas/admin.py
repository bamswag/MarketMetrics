from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    userID: str
    email: str
    displayName: str
    primaryAuthProvider: str
    passwordAuthEnabled: bool = True
    googleLinked: bool = False
    emailNotificationsEnabled: bool = False
    emailVerifiedAt: Optional[datetime] = None
    isAdmin: bool = False
    isActive: bool = True
    sessionVersion: int = 1
    riskProfile: Optional[str] = None
    createdAt: datetime
    lastLoginAt: Optional[datetime] = None
    planName: str = "Free"
    accountStatus: str = "Active"


class AdminUserUpdate(BaseModel):
    displayName: Optional[str] = None
    emailVerifiedAt: Optional[datetime] = None


class AdminUserListResponse(BaseModel):
    items: List[AdminUserOut]
    total: int
    page: int
    pageSize: int
    totalPages: int


class AdminAuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    adminUserID: str
    targetUserID: Optional[str] = None
    action: str
    details: Optional[str] = None
    createdAt: datetime


class AdminAuditLogListResponse(BaseModel):
    items: List[AdminAuditLogOut]
    total: int
    page: int
    pageSize: int
    totalPages: int


class SetUserStatusPayload(BaseModel):
    active: bool
