from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from app.core.database import Base


class PriceAlertDB(Base):
    __tablename__ = "price_alerts"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    userID = Column(String, ForeignKey("users.userID"), nullable=False, index=True)

    symbol = Column(String, nullable=False, index=True)
    condition = Column(String, nullable=False)
    targetPrice = Column(Float, nullable=False)

    isActive = Column(Boolean, default=True, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    lastEvaluatedAt = Column(DateTime, nullable=True)
    triggeredAt = Column(DateTime, nullable=True)

    __table_args__ = (
        CheckConstraint("condition IN ('above', 'below')", name="ck_price_alert_condition"),
        CheckConstraint("targetPrice > 0", name="ck_price_alert_target_price_positive"),
        UniqueConstraint(
            "userID",
            "symbol",
            "condition",
            "targetPrice",
            name="uq_price_alert_user_symbol_condition_target",
        ),
        Index(
            "idx_price_alert_user_symbol_active",
            "userID",
            "symbol",
            "isActive",
        ),
    )
