from datetime import datetime

from sqlalchemy import Column, DateTime, Index, String

from app.core.database import Base


class AdminAuditLogDB(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(String, primary_key=True)
    adminUserID = Column(String, nullable=False, index=True)
    targetUserID = Column(String, nullable=True)
    action = Column(String, nullable=False)
    details = Column(String, nullable=True)
    createdAt = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_admin_audit_logs_createdAt", "createdAt"),
    )
