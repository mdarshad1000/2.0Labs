import logfire
from functools import lru_cache
from typing import Optional
from core.config import settings

_logfire_configured = False


@lru_cache()        
def get_logger():
    global _logfire_configured
    
    if not _logfire_configured:
        
        config_params = {
            "service_name": "2.0Labs"
        }
        
        # If we have a token, use it and send to logfire
        logfire_token = settings.api_keys.logfire_token
        if logfire_token and logfire_token.get_secret_value():
            config_params["token"] = logfire_token.get_secret_value()
            config_params["send_to_logfire"] = True
        else:
            # No token, don't send to logfire (local dev without token)
            config_params["send_to_logfire"] = False
            print("⚠️  LOGFIRE_TOKEN not set - logs won't be sent to Logfire")
        
        logfire.configure(
            **config_params,
            scrubbing=False,
            inspect_arguments=False, 
            environment=settings.logfire.environment
        )

        # Instrument AI libraries
        logfire.instrument_openai()
        logfire.instrument_anthropic()
        
        _logfire_configured = True
        
    return logfire


def instrument_fastapi(app):
    """Instrument FastAPI application with Logfire"""
    logger = get_logger()
    logger.instrument_fastapi(
        app,
        capture_headers=True,
        excluded_urls=["/health", "/docs", "/openapi.json", "/redoc"]
    )


def log_info(message: str, **kwargs):
    logger = get_logger()
    logger.info(message, **kwargs)


def log_debug(message: str, **kwargs):
    logger = get_logger()
    logger.debug(message, **kwargs)


def log_warning(message: str, **kwargs):
    logger = get_logger()
    logger.warning(message, **kwargs)


def log_error(message: str, error: Optional[Exception] = None, **kwargs):
    logger = get_logger()
    if error:
        kwargs["error"] = str(error)
        kwargs["error_type"] = error.__class__.__name__
    logger.error(message, **kwargs)


def log_critical(message: str, **kwargs):
    logger = get_logger()
    logger.critical(message, **kwargs)


logger = get_logger()

