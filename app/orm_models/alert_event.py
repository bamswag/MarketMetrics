from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, String

from app.core.database import Base


class AlertEventDB(Base):
    __tablename__ = "alert_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    alertID = Column(
        String,
        ForeignKey("price_alerts.id", ondelete="CASCADE"),
        nullable=False,
    )
    userID = Column(String, ForeignKey("users.userID"), nullable=False)
    symbol = Column(String, nullable=False)
    condition = Column(String, nullable=False)
    targetPrice = Column(Float, nullable=True)
    triggerPrice = Column(Float, nullable=False)
    triggeredAt = Column(DateTime, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_alert_event_alert_id", "alertID"),
        Index("idx_alert_event_user_id", "userID"),
    )
