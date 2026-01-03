from .auth import auth_router
from .chat import router as chat_router
from .extract import router as extract_router
from .graph import router as graph_router
from .infer import router as infer_router
from .reservoir import router as reservoir_router
from .template import router as template_router
from .upload import router as upload_router
from .visualization import router as visualization_router

__all__ = ["auth_router", "chat_router", "extract_router", "graph_router", "infer_router", "reservoir_router", "template_router", "upload_router", "visualization_router"]

