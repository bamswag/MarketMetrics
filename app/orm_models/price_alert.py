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
)
from app.core.database import Base


class PriceAlertDB(Base):
    __tablename__ = "price_alerts"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    userID = Column(String, ForeignKey("users.userID"), nullable=False, index=True)

    symbol = Column(String, nullable=False, index=True)
    condition = Column(String, nullable=False)
    targetPrice = Column(Float, nullable=True)

    # Fields for percent_change condition
    referencePrice = Column(Float, nullable=True)

    # Fields for range_exit condition
    lowerBound = Column(Float, nullable=True)
    upperBound = Column(Float, nullable=True)

    severity = Column(String, nullable=True, default="normal")
    expiresAt = Column(DateTime, nullable=True)

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
        CheckConstraint(
            "condition IN ('above', 'below', 'percent_change', 'range_exit')",
            name="ck_price_alert_condition",
        ),
        Index(
            "idx_price_alert_user_symbol_active",
            "userID",
            "symbol",
            "isActive",
        ),
    )
