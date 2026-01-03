"""
Authentication API routes.
Handles Google OAuth, email authentication, and session management.
"""
import json
import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, get_required_user
from auth.email import email_auth_client
from auth.google import google_auth_client
from auth.utils import (
    clear_session_cookie,
    is_verification_code_valid,
    set_session_cookie,
)
from core.config import settings
from core.logfire_config import log_error, log_info, log_warning
from database.base import get_db
from database.crud import user_crud
from helpers.email import send_welcome_email
from models.auth import (
    AuthResponse,
    CurrentUser,
    EmailSetNameRequest,
    EmailSignInRequest,
    EmailVerifyRequest,
    UserCreateWithProvider,
    UserUpdate,
)

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])

# IMPORTANT: Do NOT cache settings values at module level!
# They must be read dynamically inside functions to pick up env vars at runtime.


@auth_router.get("/me", response_model=AuthResponse)
async def get_me(current_user: Optional[CurrentUser] = Depends(get_current_user)):
    """Get the current authenticated user."""
    if not current_user:
        return AuthResponse(success=False, message="Not authenticated")

    return AuthResponse(success=True, message="User found", user=current_user)


@auth_router.get("/logout")
async def logout(
    response: Response,
    request: Request,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
    all_devices: bool = Query(False),
):
    """
    Logout the current user.
    
    Args:
        all_devices: If True, revokes all sessions for the user
    """
    if all_devices and current_user:
        # Revoke all user sessions
        user_crud.revoke_all_sessions(db=db, user_id=current_user.id)
    else:
        # Get token from cookie and revoke this specific session
        from auth.constants import SESSION_COOKIE_NAME
        token = request.cookies.get(SESSION_COOKIE_NAME)
        if token:
            user_crud.revoke_session(db=db, token=token)

    # Clear the session cookie
    clear_session_cookie(response)

    return AuthResponse(success=True, message="Logged out successfully")


# ============= Google OAuth =============

@auth_router.get("/google/login")
async def google_login():
    """Start Google OAuth flow. Returns the auth URL to redirect to."""
    # Generate a random state for security
    state = secrets.token_urlsafe(32)

    # Get the authorization URL
    auth_url = google_auth_client.get_auth_url(state=state)

    return {"auth_url": auth_url}


@auth_router.get("/google/callback", response_class=RedirectResponse)
async def google_callback(
    request: Request,
    code: str = Query(...),
    db: Session = Depends(get_db),
):
    """Handle Google OAuth callback."""
    try:
        # Exchange the code for a token
        token_data = google_auth_client.get_token(code)
        if not token_data or "access_token" not in token_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get access token",
            )

        # Get user info from Google
        user_info = google_auth_client.get_user_info(token_data["access_token"])
        if not user_info:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user info",
            )

        # Check if user exists with a different provider
        existing_user = user_crud.get_by_email_and_provider(
            db, email=user_info.email, provider="google"
        )
        user_with_different_provider = user_crud.get_by_email(db, email=user_info.email)

        if user_with_different_provider and not existing_user:
            # User exists but with a different provider - redirect with error
            redirect_url = f"{settings.client_domain}/auth/callback?success=false&error=different_provider"
            return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)

        # Create or update user
        user_data = UserCreateWithProvider(
            email=user_info.email,
            name=user_info.name,
            picture=user_info.picture,
            locale=user_info.locale,
            auth_provider="google",
            provider_user_id=user_info.id,
        )

        db_user, newly_created = user_crud.upsert_with_provider(db=db, obj_in=user_data)

        # Send welcome email for new users
        if newly_created:
            send_welcome_email(
                email=str(db_user.email), 
                name=str(db_user.name) if db_user.name else None
            )

        # Create a new session
        user_agent = request.headers.get("user-agent")
        client_host = request.client.host if request.client else None

        if not db_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found after creation",
            )

        session = user_crud.create_session(
            db=db,
            user_id=db_user.id,
            user_agent=user_agent,
            ip_address=client_host,
        )

        # Create redirect response
        redirect_url = f"{settings.client_domain}/auth/callback?success=true"

        if newly_created:
            redirect_url += "&welcome=true"

        redirect_response = RedirectResponse(
            url=redirect_url, status_code=status.HTTP_302_FOUND
        )

        # Set the session cookie on the redirect response
        set_session_cookie(
            redirect_response, token=session.token, expires_at=session.expires_at
        )

        # Set a header that the frontend can use to detect successful auth
        redirect_response.headers["X-Auth-Success"] = "true"

        return redirect_response
        
    except Exception as e:
        log_error("Error during Google OAuth callback", error=e)
        # Redirect to frontend with failure status
        redirect_url = f"{settings.client_domain}/auth/callback?success=false&error=callback_failed"
        redirect_response = RedirectResponse(
            url=redirect_url, status_code=status.HTTP_302_FOUND
        )
        return redirect_response


# ============= Email Authentication =============

@auth_router.post("/email/signin", response_model=AuthResponse)
async def email_signin(
    request_data: EmailSignInRequest,
    db: Session = Depends(get_db),
):
    """
    Initiate email sign-in by sending a 6-digit verification code.
    Creates user if they don't exist.
    """
    try:
        email = request_data.email.lower().strip()

        # Check if user exists with email auth provider
        db_user = user_crud.get_by_email_and_provider(db, email=email, provider="email")

        # Check if user exists with a different provider
        user_with_different_provider = user_crud.get_by_email(db, email=email)

        if user_with_different_provider and not db_user:
            # User exists but with a different provider
            return AuthResponse(
                success=False,
                message="You previously used a different sign in method. Please try again.",
            )

        newly_created = False

        # If user doesn't exist, create them
        if not db_user:
            db_user = user_crud.create_email_user(db, email=email)
            log_info("Created new email user", email=email)
            newly_created = True

        # Generate verification code
        code, expires_at = email_auth_client.generate_verification_data()

        # Update user with verification code
        user_crud.update_verification_code(
            db, user=db_user, code=code, expires_at=expires_at
        )

        # Send verification email
        success = email_auth_client.send_verification_code(email, code)

        if success:
            return AuthResponse(
                success=True,
                message="Verification code sent to your email",
                newly_created=newly_created,
            )
        else:
            return AuthResponse(
                success=False,
                message="Failed to send verification code. Please try again.",
            )

    except Exception as e:
        log_error("Error during email sign-in", error=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during sign-in",
        )


@auth_router.post("/email/fullname", response_model=AuthResponse)
async def email_set_name(
    request_data: EmailSetNameRequest,
    db: Session = Depends(get_db),
):
    """
    Set name for email user if they don't have one.
    """
    try:
        email = request_data.email.lower().strip()

        # Check if user exists with email auth provider
        db_user = user_crud.get_by_email_and_provider(db, email=email, provider="email")

        if not db_user:
            return AuthResponse(success=False, message="User not found")

        if db_user.name:
            return AuthResponse(success=True, message="Name already set")

        # Update user with name
        user_crud.update(
            db, db_obj=db_user, obj_in=UserUpdate(name=request_data.name)
        )

        return AuthResponse(success=True, message="Name set successfully")

    except Exception as e:
        log_error("Error during setting name", error=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during setting name",
        )


@auth_router.post("/email/verify")
async def email_verify(
    request_data: EmailVerifyRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    """
    Verify email with 6-digit code and create session.
    """
    try:
        email = request_data.email.lower().strip()
        code = request_data.code.strip()

        # Find user with email auth provider
        db_user = user_crud.get_by_email_and_provider(db, email=email, provider="email")

        if not db_user:
            return Response(
                content=json.dumps({"success": False, "message": "User not found"}),
                status_code=200,
                media_type="application/json",
            )

        new_user = db_user.is_email_verified == False

        # Check if verification code matches and is not expired
        verification_token = str(db_user.email_verification_token) if db_user.email_verification_token else None
        verification_expires = db_user.email_verification_expires_at

        if (
            not verification_token
            or not verification_expires
            or not is_verification_code_valid(
                verification_expires, code, verification_token
            )
        ):
            return Response(
                content=json.dumps({"success": False, "message": "Invalid or expired verification code"}),
                status_code=200,
                media_type="application/json",
            )

        # Mark email as verified and clear verification code
        user_crud.verify_email(db, user=db_user)

        # Create a new session
        user_agent = http_request.headers.get("user-agent")
        client_host = http_request.client.host if http_request.client else None

        session = user_crud.create_session(
            db=db,
            user_id=db_user.id,
            user_agent=user_agent,
            ip_address=client_host,
        )

        # Send welcome email for new users
        if new_user:
            send_welcome_email(
                email=str(db_user.email),
                name=str(db_user.name) if db_user.name else None
            )

        # Create redirect URL
        redirect_url = f"{settings.client_domain}/auth/callback?success=true"

        if new_user:
            redirect_url += "&welcome=true"

        # Create JSON response with redirect info
        response_data = {
            "success": True,
            "message": "Email verified successfully",
            "redirectUrl": redirect_url,
        }

        # Create response and set the session cookie
        response = Response(
            content=json.dumps(response_data),
            status_code=200,
            media_type="application/json",
        )

        # Set the session cookie on the response
        set_session_cookie(
            response, token=session.token, expires_at=session.expires_at
        )

        return response

    except Exception as e:
        log_error("Error during email verification", error=e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during verification",
        )

