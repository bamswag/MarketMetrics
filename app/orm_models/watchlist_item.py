from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, String, UniqueConstraint
from app.core.database import Base


class WatchlistItemDB(Base):
    __tablename__ = "watchlist_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    userID = Column(String, nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("userID", "symbol", name="uq_watchlist_user_symbol"),
    )