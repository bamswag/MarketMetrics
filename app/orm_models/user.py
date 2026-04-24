from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from app.core.database import Base


class UserDB(Base):
    __tablename__ = "users"

    userID = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    passwordHash = Column(String, nullable=False)
    displayName = Column(String, nullable=False)
    primaryAuthProvider = Column(String, default="password", nullable=False)
    passwordAuthEnabled = Column(Boolean, default=True, nullable=False)
    googleSubject = Column(String, unique=True, index=True, nullable=True)
    emailNotificationsEnabled = Column(Boolean, default=False, nullable=True)
    emailVerifiedAt = Column(DateTime, nullable=True)
    pendingEmail = Column(String, nullable=True)
    sessionVersion = Column(Integer, default=1, nullable=False)
    passwordResetTokenHash = Column(String, nullable=True)
    passwordResetTokenExpiresAt = Column(DateTime, nullable=True)
    signupVerificationTokenHash = Column(String, nullable=True)
    signupVerificationTokenExpiresAt = Column(DateTime, nullable=True)
    pendingEmailTokenHash = Column(String, nullable=True)
    pendingEmailTokenExpiresAt = Column(DateTime, nullable=True)
    riskProfile = Column(String, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    lastLoginAt = Column(DateTime, nullable=True)

    @property
    def planName(self) -> str:
        return "Free"

    @property
    def accountStatus(self) -> str:
        return "Active"

    @property
    def googleLinked(self) -> bool:
        return bool(self.googleSubject)
