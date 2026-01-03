"""
SQLAlchemy models for User and Session.
Compatible with Supabase PostgreSQL.
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database.base import Base


class AuthProvider(str, Enum):
    """Supported authentication providers."""
    GOOGLE = "google"
    EMAIL = "email"
    # TODO: Add more authentication providers as needed
    # GITHUB = "github"
    # MICROSOFT = "microsoft"


class User(Base):
    """User model for authentication."""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    picture = Column(Text, nullable=True)
    
    # Authentication fields
    auth_provider = Column(String(50), nullable=False)  # "google" or "email"
    provider_user_id = Column(String(255), nullable=False, index=True)
    
    # Email verification fields (for email auth)
    is_email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_token = Column(String(6), nullable=True)  # 6-digit code
    email_verification_expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # User preferences
    locale = Column(String(10), nullable=True)  # e.g., "en", "en-US"
    
    # Account status
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Relationships
    sessions = relationship(
        "Session",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    templates = relationship(
        "Template",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="Template.user_id"
    )
    reservoir_documents = relationship(
        "ReservoirDocument",
        back_populates="user",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email})>"

    def to_dict(self) -> dict:
        """Convert user to dictionary."""
        return {
            "id": str(self.id),
            "email": self.email,
            "name": self.name,
            "picture": self.picture,
            "auth_provider": self.auth_provider,
            "is_email_verified": self.is_email_verified,
            "is_active": self.is_active,
            "is_admin": self.is_admin,
            "locale": self.locale,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Session(Base):
    """Session model for tracking user sessions."""
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    user_agent = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)  # IPv6 max length
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Relationships
    user = relationship("User", back_populates="sessions")

    # Indexes
    __table_args__ = (
        Index("ix_sessions_user_id", "user_id"),
        Index("ix_sessions_expires_at", "expires_at"),
    )

    def __repr__(self) -> str:
        return f"<Session(id={self.id}, user_id={self.user_id})>"

    def to_dict(self) -> dict:
        """Convert session to dictionary."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "token": self.token,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "user_agent": self.user_agent,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ReservoirDocument(Base):
    """
    ReservoirDocument model - the user's document vault/substrate.
    Documents ingested here are available across all thinking modes (Prism, Atlas).
    """
    __tablename__ = "reservoir_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Document metadata
    name = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)  # "pdf", "txt", "md", etc.
    file_size = Column(String(50), nullable=True)  # Human-readable size
    file_size_bytes = Column(String(20), nullable=True)  # Exact size in bytes
    
    # Storage
    s3_key = Column(String(512), nullable=True)  # S3 storage key if uploaded to cloud
    content_hash = Column(String(64), nullable=True)  # SHA-256 hash for deduplication
    
    # Extracted content
    extracted_text = Column(Text, nullable=True)  # Full extracted text content
    
    # Status
    is_processed = Column(Boolean, default=False, nullable=False)
    processing_error = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Relationships
    user = relationship("User", back_populates="reservoir_documents")

    # Indexes
    __table_args__ = (
        Index("ix_reservoir_documents_user_id", "user_id"),
        Index("ix_reservoir_documents_content_hash", "content_hash"),
        Index("ix_reservoir_documents_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ReservoirDocument(id={self.id}, name={self.name})>"

    def to_dict(self) -> dict:
        """Convert document to dictionary."""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "name": self.name,
            "original_filename": self.original_filename,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "file_size_bytes": self.file_size_bytes,
            "s3_key": self.s3_key,
            "is_processed": self.is_processed,
            "processing_error": self.processing_error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Template(Base):
    """Template model for analysis templates."""
    __tablename__ = "templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    subtitle = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    
    # Metrics stored as JSONB array: [{id, label, description, type}]
    metrics = Column(JSONB, nullable=False, default=list)
    
    # Owner - null means system default template
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    
    # System templates are available to all users
    is_system = Column(Boolean, default=False, nullable=False)
    
    # Fork tracking - null if original
    forked_from_id = Column(
        UUID(as_uuid=True),
        ForeignKey("templates.id", ondelete="SET NULL"),
        nullable=True
    )
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Relationships
    user = relationship("User", back_populates="templates", foreign_keys=[user_id])
    forked_from = relationship("Template", remote_side=[id], foreign_keys=[forked_from_id])

    # Indexes
    __table_args__ = (
        Index("ix_templates_user_id", "user_id"),
        Index("ix_templates_is_system", "is_system"),
    )

    def __repr__(self) -> str:
        return f"<Template(id={self.id}, name={self.name})>"

    def to_dict(self) -> dict:
        """Convert template to dictionary."""
        return {
            "id": str(self.id),
            "name": self.name,
            "subtitle": self.subtitle,
            "description": self.description,
            "metrics": self.metrics or [],
            "user_id": str(self.user_id) if self.user_id else None,
            "is_system": self.is_system,
            "forked_from_id": str(self.forked_from_id) if self.forked_from_id else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

