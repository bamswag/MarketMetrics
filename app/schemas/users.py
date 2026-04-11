from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    displayName: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    userID: str
    email: EmailStr
    displayName: str
    createdAt: datetime
    lastLoginAt: Optional[datetime] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
