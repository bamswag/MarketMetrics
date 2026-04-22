from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    displayName: str
    acceptedTerms: bool

    @field_validator("acceptedTerms")
    @classmethod
    def validate_terms_acceptance(cls, value: bool):
        if value is not True:
            raise ValueError("You must agree to the Terms and Privacy Policy to create an account.")
        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    userID: str
    email: EmailStr
    displayName: str
    primaryAuthProvider: str
    passwordAuthEnabled: bool = True
    googleLinked: bool = False
    emailNotificationsEnabled: bool = False
    emailVerifiedAt: Optional[datetime] = None
    pendingEmail: Optional[EmailStr] = None
    sessionVersion: int = 1
    createdAt: datetime
    lastLoginAt: Optional[datetime] = None
    planName: str = "Free"
    accountStatus: str = "Active"
    riskProfile: Optional[str] = None


class UserPreferencesUpdate(BaseModel):
    emailNotificationsEnabled: Optional[bool] = None
    riskProfile: Optional[str] = None


class UserProfileUpdate(BaseModel):
    displayName: Optional[str] = None
    email: Optional[EmailStr] = None


class UserPasswordUpdate(BaseModel):
    currentPassword: Optional[str] = None
    newPassword: str = Field(min_length=8)


class PasswordForgotRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    token: str = Field(min_length=12)
    newPassword: str = Field(min_length=8)


class EmailVerificationRequest(BaseModel):
    token: str = Field(min_length=12)


class AuthMessage(BaseModel):
    message: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
