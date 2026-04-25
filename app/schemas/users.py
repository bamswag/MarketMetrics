from datetime import datetime
import re
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

PASSWORD_POLICY_MESSAGE = (
    "Choose a password with at least 8 characters, including one number and one special character."
)
_PASSWORD_DIGIT_PATTERN = re.compile(r"\d")
_PASSWORD_SPECIAL_PATTERN = re.compile(r"[^A-Za-z0-9\s]")


def validate_password_policy(password: str) -> str:
    if (
        len(password) < 8
        or not _PASSWORD_DIGIT_PATTERN.search(password)
        or not _PASSWORD_SPECIAL_PATTERN.search(password)
    ):
        raise ValueError(PASSWORD_POLICY_MESSAGE)
    return password


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    displayName: str
    acceptedTerms: bool

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str):
        return validate_password_policy(value)

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
    isAdmin: bool = False


class UserPreferencesUpdate(BaseModel):
    emailNotificationsEnabled: Optional[bool] = None
    riskProfile: Optional[str] = None


class UserProfileUpdate(BaseModel):
    displayName: Optional[str] = None
    email: Optional[EmailStr] = None


class UserPasswordUpdate(BaseModel):
    currentPassword: Optional[str] = None
    newPassword: str

    @field_validator("newPassword")
    @classmethod
    def validate_new_password(cls, value: str):
        return validate_password_policy(value)


class PasswordForgotRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    token: str = Field(min_length=12)
    newPassword: str

    @field_validator("newPassword")
    @classmethod
    def validate_new_password(cls, value: str):
        return validate_password_policy(value)


class EmailVerificationRequest(BaseModel):
    token: str = Field(min_length=12)


class AuthMessage(BaseModel):
    message: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
