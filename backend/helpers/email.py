"""
Email sending utilities using Resend.
"""
from pathlib import Path
from typing import Optional

import resend

from core.config import settings
from core.logfire_config import log_error, log_info, log_warning

# Initialize Resend with API key from settings
_resend_key = settings.api_keys.resend_api_key
resend.api_key = _resend_key.get_secret_value() if _resend_key else None

CLIENT_DOMAIN = settings.client_domain
FROM_EMAIL = settings.email.from_email
FROM_NAME = settings.email.from_name


def load_email_template(template_name: str) -> str:
    """
    Load HTML email template from templates directory.
    
    Args:
        template_name: Name of the template file
        
    Returns:
        str: The template content
    """
    # Get the directory of the current file
    current_dir = Path(__file__).parent
    template_path = current_dir / "templates" / template_name

    try:
        with open(template_path, "r", encoding="utf-8") as file:
            return file.read()
    except FileNotFoundError:
        raise FileNotFoundError(
            f"Template {template_name} not found at {template_path}"
        )


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str = "",
    from_name: str = FROM_NAME,
    from_address: str = FROM_EMAIL,
) -> bool:
    """
    Send a generic email using Resend.

    Args:
        to_email: Recipient email address
        subject: Email subject
        html_content: HTML content of the email
        text_content: Plain text content (optional)
        from_name: Sender name
        from_address: Sender email address

    Returns:
        bool: True if email was sent successfully, False otherwise
    """
    if not RESEND_API_KEY:
        log_warning("RESEND_API_KEY not configured - logging email instead of sending")
        log_info("Email would be sent", to=to_email, subject=subject, content_preview=(text_content or html_content[:200]))
        return True  # Return True in dev mode to continue flow

    try:
        payload: resend.Emails.SendParams = {
            "from": f"{from_name} <{from_address}>",
            "to": to_email,
            "subject": subject,
            "html": html_content,
        }

        # Add text content if provided
        if text_content:
            payload["text"] = text_content

        result = resend.Emails.send(payload)
        log_info("Email sent successfully", to=to_email, email_id=result.get('id', 'unknown'))
        return True

    except Exception as e:
        log_error("Failed to send email", error=e, to=to_email)
        return False


def send_welcome_email(email: str, name: Optional[str] = None) -> bool:
    """
    Send a welcome email to a new user.
    
    Args:
        email: User's email address
        name: User's name (optional)
        
    Returns:
        bool: True if sent successfully
    """
    try:
        formatted_name = f", {name}" if name else ""
        subject = "Welcome to 2.0Labs!"
        
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #10b981; margin-bottom: 10px;">2.0Labs</h1>
                    <h2 style="color: #666; font-weight: normal;">Welcome{formatted_name}!</h2>
                </div>
                
                <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; text-align: center; margin-bottom: 30px;">
                    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                        Thank you for joining 2.0Labs. We're excited to have you on board!
                    </p>
                    <a href="{CLIENT_DOMAIN}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Get Started
                    </a>
                </div>
                
                <div style="text-align: center; color: #666; font-size: 14px;">
                    <p>If you have any questions, feel free to reach out to us.</p>
                </div>
            </body>
        </html>
        """
        
        text_content = f"Welcome{formatted_name}! Thank you for joining 2.0Labs. Visit {CLIENT_DOMAIN} to get started."
        
        return send_email(
            to_email=email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )
        
    except Exception as e:
        log_error("Failed to send welcome email", error=e, email=email)
        return False

