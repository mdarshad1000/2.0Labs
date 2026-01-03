"""
CRUD operations for User and Session models.
"""
import datetime
import secrets
import uuid
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from database.models import User, Session as DBSession, Template
from models.auth import UserCreateWithProvider, UserUpdate
from core.logfire_config import log_error, log_info, log_warning


class CRUDUser:
    """CRUD operations for User model."""

    def get(self, db: Session, *, id: UUID) -> Optional[User]:
        """Get a user by ID."""
        return db.query(User).filter(User.id == id).first()

    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        """Get a user by email."""
        return db.query(User).filter(User.email == email).first()

    def get_by_provider_id(
        self, db: Session, *, provider: str, provider_user_id: str
    ) -> Optional[User]:
        """Get a user by provider and provider's user ID."""
        return (
            db.query(User)
            .filter(
                User.auth_provider == provider,
                User.provider_user_id == provider_user_id,
            )
            .first()
        )

    def get_by_email_and_provider(
        self, db: Session, *, email: str, provider: str = "email"
    ) -> Optional[User]:
        """Get a user by email and specific auth provider."""
        return (
            db.query(User)
            .filter(User.email == email, User.auth_provider == provider)
            .first()
        )

    def create_with_provider(
        self, db: Session, *, obj_in: UserCreateWithProvider
    ) -> User:
        """Create a new user from OAuth provider data."""
        db_obj = User(
            email=obj_in.email,
            name=obj_in.name,
            picture=obj_in.picture,
            auth_provider=obj_in.auth_provider,
            provider_user_id=obj_in.provider_user_id,
            locale=obj_in.locale,
            is_email_verified=obj_in.is_email_verified,
            is_active=True,
            is_admin=False,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def upsert_with_provider(
        self, db: Session, *, obj_in: UserCreateWithProvider
    ) -> tuple[User, bool]:
        """
        Create or update a user from OAuth provider data.
        If user exists (by provider ID), update their info.
        If not, create new user.
        
        Returns:
            tuple[User, bool]: (user, newly_created)
        """
        # First try to find by provider ID
        db_user = self.get_by_provider_id(
            db, provider=obj_in.auth_provider, provider_user_id=obj_in.provider_user_id
        )

        # Since OAuth providers verify email, we can mark email as verified
        obj_in.is_email_verified = True

        # If exists, update info
        if db_user:
            update_data = obj_in.model_dump(
                exclude={"auth_provider", "provider_user_id"}
            )
            for field, value in update_data.items():
                if value is not None:
                    setattr(db_user, field, value)
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
            return db_user, False

        # If not found by provider ID, check email (might have registered with another provider)
        db_user = self.get_by_email(db, email=obj_in.email)
        if db_user:
            # User exists with this email but different provider
            log_info(
                "User with email already exists with different provider",
                email=obj_in.email,
                existing_provider=db_user.auth_provider,
                new_provider=obj_in.auth_provider
            )
            # Update user with new provider info
            db_user.auth_provider = obj_in.auth_provider
            db_user.provider_user_id = obj_in.provider_user_id
            db_user.name = obj_in.name or db_user.name
            db_user.picture = obj_in.picture or db_user.picture
            db_user.locale = obj_in.locale or db_user.locale
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
            return db_user, False

        # Create new user if not found
        db_user = self.create_with_provider(db, obj_in=obj_in)
        return db_user, True

    def create_email_user(
        self, db: Session, *, email: str, name: Optional[str] = None
    ) -> User:
        """Create a new user for email authentication."""
        db_obj = User(
            email=email,
            name=name,
            auth_provider="email",
            provider_user_id=email,  # Use email as provider_user_id for email auth
            is_active=True,
            is_admin=False,
            is_email_verified=False,  # Not verified initially
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self, db: Session, *, db_obj: User, obj_in: UserUpdate
    ) -> User:
        """Update a user."""
        update_data = obj_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_verification_code(
        self, db: Session, *, user: User, code: str, expires_at: datetime.datetime
    ) -> User:
        """Update user's verification code and expiry."""
        user.email_verification_token = code
        user.email_verification_expires_at = expires_at
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def verify_email(self, db: Session, *, user: User) -> User:
        """Mark user's email as verified and clear verification code."""
        user.is_email_verified = True
        user.email_verification_token = None
        user.email_verification_expires_at = None
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    # ============= Session Management =============

    def create_session(
        self,
        db: Session,
        *,
        user_id: UUID,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
        expires_in_days: int = 30,
    ) -> DBSession:
        """Create a new session for a user."""
        token = secrets.token_hex(32)  # 64 characters
        expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
            days=expires_in_days
        )

        session = DBSession(
            id=uuid.uuid4(),
            user_id=user_id,
            token=token,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )

        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def get_by_token(self, db: Session, *, token: str) -> Optional[DBSession]:
        """Get session by token."""
        now = datetime.datetime.now(datetime.timezone.utc)
        session = (
            db.query(DBSession)
            .filter(DBSession.token == token, DBSession.expires_at > now)
            .first()
        )
        return session

    def revoke_session(self, db: Session, *, token: str) -> bool:
        """Revoke (delete) a session."""
        session = db.query(DBSession).filter(DBSession.token == token).first()
        if session:
            db.delete(session)
            db.commit()
            return True
        return False

    def revoke_all_sessions(self, db: Session, *, user_id: UUID) -> int:
        """Revoke all sessions for a user."""
        result = db.query(DBSession).filter(DBSession.user_id == user_id).delete()
        db.commit()
        return result


class CRUDTemplate:
    """CRUD operations for Template model."""

    def get(self, db: Session, *, id: UUID) -> Optional[Template]:
        """Get a template by ID."""
        return db.query(Template).filter(Template.id == id).first()

    def get_all_for_user(self, db: Session, *, user_id: Optional[UUID] = None) -> list[Template]:
        """
        Get all templates available to a user.
        Returns system templates + user's own templates.
        """
        if user_id:
            return (
                db.query(Template)
                .filter(
                    (Template.is_system == True) | (Template.user_id == user_id)
                )
                .order_by(Template.is_system.desc(), Template.created_at.asc())
                .all()
            )
        else:
            # Only system templates for unauthenticated users
            return (
                db.query(Template)
                .filter(Template.is_system == True)
                .order_by(Template.created_at.asc())
                .all()
            )

    def get_system_templates(self, db: Session) -> list[Template]:
        """Get all system templates."""
        return (
            db.query(Template)
            .filter(Template.is_system == True)
            .order_by(Template.created_at.asc())
            .all()
        )

    def get_user_templates(self, db: Session, *, user_id: UUID) -> list[Template]:
        """Get all templates owned by a user."""
        return (
            db.query(Template)
            .filter(Template.user_id == user_id)
            .order_by(Template.created_at.desc())
            .all()
        )

    def create(
        self,
        db: Session,
        *,
        name: str,
        user_id: UUID,
        subtitle: Optional[str] = None,
        description: Optional[str] = None,
        metrics: list = None,
        forked_from_id: Optional[UUID] = None,
    ) -> Template:
        """Create a new user-owned template."""
        db_obj = Template(
            name=name,
            subtitle=subtitle,
            description=description,
            metrics=metrics or [],
            user_id=user_id,
            is_system=False,
            forked_from_id=forked_from_id,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def fork(
        self,
        db: Session,
        *,
        template_id: UUID,
        user_id: UUID,
        new_name: Optional[str] = None,
    ) -> Optional[Template]:
        """Fork an existing template for a user."""
        source = self.get(db, id=template_id)
        if not source:
            return None
        
        forked = Template(
            name=new_name or f"{source.name} (Copy)",
            subtitle=source.subtitle,
            description=source.description,
            metrics=source.metrics.copy() if source.metrics else [],
            user_id=user_id,
            is_system=False,
            forked_from_id=template_id,
        )
        db.add(forked)
        db.commit()
        db.refresh(forked)
        return forked

    def update(
        self,
        db: Session,
        *,
        db_obj: Template,
        name: Optional[str] = None,
        subtitle: Optional[str] = None,
        description: Optional[str] = None,
        metrics: Optional[list] = None,
    ) -> Template:
        """Update a template (only if user-owned)."""
        if name is not None:
            db_obj.name = name
        if subtitle is not None:
            db_obj.subtitle = subtitle
        if description is not None:
            db_obj.description = description
        if metrics is not None:
            db_obj.metrics = metrics
        
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def delete(self, db: Session, *, db_obj: Template) -> bool:
        """Delete a template (only if user-owned)."""
        if db_obj.is_system:
            return False
        db.delete(db_obj)
        db.commit()
        return True

    def can_modify(self, template: Template, user_id: UUID) -> bool:
        """Check if a user can modify a template."""
        return not template.is_system and template.user_id == user_id


# Create singleton instances
user_crud = CRUDUser()
template_crud = CRUDTemplate()

