import sys
from pathlib import Path
from contextlib import asynccontextmanager

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.config import settings
from core.logfire_config import log_info, log_error, instrument_fastapi
from routers import auth_router, chat_router, extract_router, graph_router, infer_router, reservoir_router, template_router, upload_router, visualization_router
from services.llm_service import llm_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    try:
        log_info("2.0Labs Backend starting up...")
        log_info("Application ready", provider=llm_service.provider)
    except Exception as e:
        log_error("Failed during startup", error=e)
        raise
    
    yield
    
    # Shutdown
    log_info("2.0Labs Backend shutting down")


app = FastAPI(
    title="2.0Labs Backend",
    description="Matrix-first analytical assistant API",
    version="1.0.0",
    lifespan=lifespan
)

# Instrument FastAPI with Logfire for automatic request/response logging
instrument_fastapi(app)

# Configure CORS for frontend from settings
allowed_origins = settings.get_cors_origins_list()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(extract_router)
app.include_router(graph_router)
app.include_router(infer_router)
app.include_router(reservoir_router)
app.include_router(template_router)
app.include_router(upload_router)
app.include_router(visualization_router)


@app.get("/")
async def root():
    return {"status": "ok", "service": "2.0Labs Backend"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/provider")
async def get_provider():
    """Get current LLM provider."""
    return {
        "provider": llm_service.provider,
        "available_providers": ["openai", "gemini"]
    }


class ProviderRequest(BaseModel):
    provider: str


@app.post("/api/provider")
async def set_provider(request: ProviderRequest):
    """Switch LLM provider (openai or gemini)."""
    try:
        llm_service.set_provider(request.provider)
        return {
            "status": "ok",
            "provider": llm_service.provider,
            "message": f"Switched to {request.provider}"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

