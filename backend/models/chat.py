from pydantic import BaseModel
from typing import Optional, List, Literal, Union
from datetime import datetime


class CellCitation(BaseModel):
    type: Literal["cell"] = "cell"
    index: int
    doc_id: str
    doc_name: str
    metric_id: str
    metric_label: str
    value: str


class DocumentCitation(BaseModel):
    type: Literal["document"] = "document"
    index: int
    doc_id: str
    doc_name: str
    section: Optional[str] = None
    page: Optional[int] = None
    excerpt: str


Citation = Union[CellCitation, DocumentCitation]


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: datetime
    citations: Optional[List[Citation]] = None


class ChatRequest(BaseModel):
    query: str
    session_id: str
    matrix_context: dict  # Full matrix state from frontend


class ChatResponse(BaseModel):
    message: ChatMessage
    matrix_cells_used: int
    documents_searched: int
    confidence: Literal['High', 'Medium', 'Low']

