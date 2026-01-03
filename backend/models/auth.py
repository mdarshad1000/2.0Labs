"""
Pydantic schemas for authentication.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


# ============= User Schemas =============

class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr
    name: Optional[str] = None
    picture: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    is_email_verified: bool = False
    locale: Optional[str] = None


class UserCreate(UserBase):
    """Schema for creating a new user with password."""
    password: str


class UserCreateWithProvider(UserBase):
    """Schema for creating a user from OAuth provider."""
    auth_provider: str
    provider_user_id: str


class UserUpdate(BaseModel):
    """Schema for updating a user."""
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    picture: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    locale: Optional[str] = None


class User(UserBase):
    """Schema for returning a user."""
    id: UUID
    auth_provider: str
    is_email_verified: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============= Session Schemas =============

class SessionBase(BaseModel):
    """Base session schema."""
    user_id: UUID
    expires_at: datetime
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None


class SessionCreate(SessionBase):
    """Schema for creating a session."""
    token: str


class Session(SessionBase):
    """Schema for returning a session."""
    id: UUID
    token: str
    created_at: datetime

    class Config:
        from_attributes = True


# ============= Token Schemas =============

class Token(BaseModel):
    """Token schema for JWT."""
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """Schema to encode in JWT."""
    sub: str  # user_id
    exp: int  # expiration time


# ============= OAuth Schemas =============

class OAuthUserInfo(BaseModel):
    """OAuth response user info."""
    id: str
    email: EmailStr
    name: Optional[str] = None
    picture: Optional[str] = None
    locale: Optional[str] = None


# ============= Current User Schema =============

class CurrentUser(BaseModel):
    """Current authenticated user with permissions."""
    id: UUID
    email: EmailStr
    name: Optional[str] = None
    is_admin: bool = False
    picture: Optional[str] = None
    is_email_verified: bool = False
    is_active: bool = True

    class Config:
        from_attributes = True


# ============= Auth Response Schemas =============

class AuthResponse(BaseModel):
    """Response model for auth routes."""
    success: bool
    message: str
    user: Optional[CurrentUser] = None
    newly_created: bool = False


# ============= Email Auth Request Schemas =============

class EmailSignInRequest(BaseModel):
    """Request model for email sign-in."""
    email: EmailStr


class EmailSetNameRequest(BaseModel):
    """Request model for setting name."""
    email: EmailStr
    name: str


class EmailVerifyRequest(BaseModel):
    """Request model for email verification."""
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)

