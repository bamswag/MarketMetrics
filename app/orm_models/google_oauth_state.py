from datetime import datetime

from sqlalchemy import Column, DateTime, String

from app.core.database import Base


class GoogleOAuthStateDB(Base):
    __tablename__ = "google_oauth_states"

    nonceHash = Column(String, primary_key=True)
    expiresAt = Column(DateTime, nullable=False, index=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
