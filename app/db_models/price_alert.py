from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, String
from app.core.database import Base


class PriceAlertDB(Base):
    __tablename__ = "price_alerts"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    userID = Column(String, nullable=False, index=True)

    symbol = Column(String, nullable=False, index=True)
    condition = Column(String, nullable=False)  # "above" or "below"
    targetPrice = Column(Float, nullable=False)

    isActive = Column(Boolean, default=True, nullable=False)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    triggeredAt = Column(DateTime, nullable=True)