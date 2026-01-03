from pydantic import BaseModel
from typing import Optional


class Document(BaseModel):
    id: str
    name: str
    type: str
    content: str
    size: int
    blob_url: Optional[str] = None


class DocSnippet(BaseModel):
    name: str
    content: str


class DocChunk(BaseModel):
    doc_id: str
    doc_name: str
    content: str
    section: Optional[str] = None
    page: Optional[int] = None
    relevance_score: float = 0.0

