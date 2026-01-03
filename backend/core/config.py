"""
Application settings with validation.
Required fields will raise ValidationError if not set in environment.
"""
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Find and load .env file from backend/ or project root
_backend_dir = Path(__file__).parent.parent
_env_file = _backend_dir / ".env"
if not _env_file.exists():
    _env_file = _backend_dir.parent / ".env"  # Try project root
load_dotenv(_env_file if _env_file.exists() else None)


class APIKeys(BaseSettings):
    """API keys - optional at startup, validated when used."""
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")
    
    openai_api_key: Optional[SecretStr] = None
    gemini_api_key: Optional[SecretStr] = None
    api_key: Optional[SecretStr] = None  # Legacy GEMINI key alias
    resend_api_key: Optional[SecretStr] = None
    logfire_token: Optional[SecretStr] = None  # LOGFIRE_TOKEN env var
    
    def require_openai(self) -> str:
        """Get OpenAI key or raise error."""
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required but not set")
        return self.openai_api_key.get_secret_value()
    
    def require_gemini(self) -> str:
        """Get Gemini key or raise error."""
        # Check both GEMINI_API_KEY and legacy API_KEY
        if self.gemini_api_key:
            return self.gemini_api_key.get_secret_value()
        if self.api_key:
            return self.api_key.get_secret_value()
        raise ValueError("GEMINI_API_KEY or API_KEY is required but not set")
    
    def require_resend(self) -> str:
        """Get Resend key or raise error."""
        if not self.resend_api_key:
            raise ValueError("RESEND_API_KEY is required but not set")
        return self.resend_api_key.get_secret_value()


class GoogleOAuth(BaseSettings):
    """Google OAuth settings."""
    model_config = SettingsConfigDict(env_prefix="GOOGLE_", extra="ignore")
    
    client_id: Optional[str] = None
    client_secret: Optional[SecretStr] = None
    redirect_uri: Optional[str] = None


class Database(BaseSettings):
    """Database settings - required."""
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")
    
    database_url: str  # Required - will error if not set


class Email(BaseSettings):
    """Email service settings."""
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")
    
    from_email: str = "noreply@2.0labs.dev"
    from_name: str = "2.0Labs"


class Session(BaseSettings):
    """Session/cookie settings."""
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")
    
    session_cookie_domain: Optional[str] = None
    secure_cookies: bool = False


class Chart(BaseSettings):
    """Chart/visualization LLM settings."""
    model_config = SettingsConfigDict(env_prefix="CHART_", extra="ignore")
    
    llm_cache_ttl: int = 300
    llm_timeout: float = 5.0
    use_llm: bool = True


class LLM(BaseSettings):
    """LLM provider settings."""
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")
    
    llm_provider: str = "openai"


class Logfire(BaseSettings):
    """Logfire settings."""
    model_config = SettingsConfigDict(env_prefix="LOGFIRE_", extra="ignore")
    
    environment: str = "local"


class Bucket(BaseSettings):
    """Supabase S3-compatible storage settings."""
    model_config = SettingsConfigDict(env_prefix="SUPABASE_S3_", extra="ignore")
    
    endpoint: str = ""  # e.g., https://<project>.storage.supabase.co/storage/v1/s3
    access_key_id: Optional[SecretStr] = None
    secret_key: Optional[SecretStr] = None
    bucket: str = ""  # Your bucket name
    region: str = "ap-southeast-1"


class Settings(BaseSettings):
    """Main settings container."""
    model_config = SettingsConfigDict(
        env_prefix="",
        extra="ignore",
        env_file=".env",
        env_file_encoding="utf-8",
    )
    
    # Nested settings
    api_keys: APIKeys = APIKeys()
    google_oauth: GoogleOAuth = GoogleOAuth()
    database: Database = Database()
    email: Email = Email()
    session: Session = Session()
    chart: Chart = Chart()
    llm: LLM = LLM()
    logfire: Logfire = Logfire()
    bucket: Bucket = Bucket()
    
    # App settings
    client_domain: str = "http://localhost:5173"
    api_domain: str = "http://localhost:8000"
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:5173,https://2olabs.netlify.app"
    
    def get_cors_origins_list(self) -> List[str]:
        """Parse CORS origins string into list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance. Raises ValidationError if required fields missing."""
    return Settings()

settings = get_settings()
