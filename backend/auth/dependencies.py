"""
Authentication dependencies for FastAPI routes.
Provides get_current_user, get_required_user, and get_admin_user.
"""
import uuid
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session

from database.base import get_db
from database.crud import user_crud
from models.auth import CurrentUser
from auth.constants import SESSION_COOKIE_NAME
from core.logfire_config import log_error, log_info, log_warning

# Setup header auth for Bearer token
api_key_header = APIKeyHeader(name="Authorization", auto_error=False)


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Depends(api_key_header),
) -> Optional[CurrentUser]:
    """
    Get the current user from session token in cookie or Authorization header.
    
    This is a FastAPI dependency that can be used in route functions.
    Returns None if no valid session is found.
    """
    token = None

    # First try from Authorization header (Bearer token)
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")

    # Then try from cookie
    if not token:
        token = request.cookies.get(SESSION_COOKIE_NAME)

    if not token:
        return None

    # Get session from database
    db_session = user_crud.get_by_token(db=db, token=token)
    if not db_session:
        return None

    # Get user from session
    db_user = user_crud.get(db=db, id=db_session.user_id)
    if not db_user or not db_user.is_active:
        return None

    if not db_user.id:
        log_error("User ID is missing in the database record")
        return None

    id_as_uuid = uuid.UUID(str(db_user.id))

    # Return CurrentUser model
    return CurrentUser(
        id=id_as_uuid,
        email=str(db_user.email),
        name=str(db_user.name) if db_user.name else None,
        is_admin=bool(db_user.is_admin),
        picture=str(db_user.picture) if db_user.picture else None,
        is_email_verified=bool(db_user.is_email_verified),
        is_active=bool(db_user.is_active),
    )


async def get_required_user(
    current_user: Annotated[Optional[CurrentUser], Depends(get_current_user)]
) -> CurrentUser:
    """
    Require a logged-in user for protected routes.
    Raises 401 Unauthorized if no user is found.
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


async def get_admin_user(
    current_user: Annotated[CurrentUser, Depends(get_required_user)]
) -> CurrentUser:
    """
    Require an admin user for admin-only routes.
    Raises 403 Forbidden if user is not admin.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions",
        )
    return current_user

