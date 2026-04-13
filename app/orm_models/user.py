from datetime import datetime
from sqlalchemy import Boolean, Column, String, DateTime
from app.core.database import Base

class UserDB(Base):
    __tablename__ = "users"

    userID = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    passwordHash = Column(String, nullable=False)
    displayName = Column(String, nullable=False)
    emailNotificationsEnabled = Column(Boolean, default=False, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    lastLoginAt = Column(DateTime, nullable=True)
