"""Reservoir API router - Document vault/substrate for all thinking modes."""
import hashlib
import uuid
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
import fitz  # PyMuPDF

from auth.dependencies import get_required_user
from database.base import get_db
from database.models import ReservoirDocument
from models.auth import CurrentUser
from core.logfire_config import logger


router = APIRouter(prefix="/api/reservoir", tags=["reservoir"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ReservoirDocumentResponse(BaseModel):
    id: str
    name: str
    original_filename: str
    file_type: str
    file_size: Optional[str]
    file_size_bytes: Optional[str]
    is_processed: bool
    created_at: str
    
    class Config:
        from_attributes = True


class ReservoirDocumentDetail(ReservoirDocumentResponse):
    """Extended response with extracted content."""
    extracted_text: Optional[str]


class ReservoirListResponse(BaseModel):
    documents: List[ReservoirDocumentResponse]
    total: int


class IngestResponse(BaseModel):
    id: str
    name: str
    file_type: str
    file_size: str
    is_processed: bool
    message: str


# ============================================================================
# Helper Functions
# ============================================================================

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF using PyMuPDF."""
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text_parts = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            if text.strip():
                text_parts.append(f"--- Page {page_num + 1} ---\n{text}")
        
        doc.close()
        return "\n\n".join(text_parts)
    except Exception as e:
        logger.error(f"Failed to parse PDF: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")


def format_file_size(size_bytes: int) -> str:
    """Convert bytes to human-readable format."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"


def compute_content_hash(content: bytes) -> str:
    """Compute SHA-256 hash for deduplication."""
    return hashlib.sha256(content).hexdigest()


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("", response_model=ReservoirListResponse)
async def list_documents(
    current_user: Annotated[CurrentUser, Depends(get_required_user)],
    db: Session = Depends(get_db),
):
    """
    List all documents in the user's Reservoir.
    
    Returns documents sorted by creation date (newest first).
    """
    documents = db.query(ReservoirDocument).filter(
        ReservoirDocument.user_id == current_user.id
    ).order_by(ReservoirDocument.created_at.desc()).all()
    
    return ReservoirListResponse(
        documents=[
            ReservoirDocumentResponse(
                id=str(doc.id),
                name=doc.name,
                original_filename=doc.original_filename,
                file_type=doc.file_type,
                file_size=doc.file_size,
                file_size_bytes=doc.file_size_bytes,
                is_processed=doc.is_processed,
                created_at=doc.created_at.isoformat() if doc.created_at else "",
            )
            for doc in documents
        ],
        total=len(documents),
    )


@router.get("/{document_id}", response_model=ReservoirDocumentDetail)
async def get_document(
    document_id: str,
    current_user: Annotated[CurrentUser, Depends(get_required_user)],
    db: Session = Depends(get_db),
):
    """
    Get a specific document from the Reservoir with its extracted content.
    """
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID format")
    
    doc = db.query(ReservoirDocument).filter(
        ReservoirDocument.id == doc_uuid,
        ReservoirDocument.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return ReservoirDocumentDetail(
        id=str(doc.id),
        name=doc.name,
        original_filename=doc.original_filename,
        file_type=doc.file_type,
        file_size=doc.file_size,
        file_size_bytes=doc.file_size_bytes,
        is_processed=doc.is_processed,
        created_at=doc.created_at.isoformat() if doc.created_at else "",
        extracted_text=doc.extracted_text,
    )


@router.post("/ingest", response_model=IngestResponse)
async def ingest_document(
    current_user: Annotated[CurrentUser, Depends(get_required_user)],
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    """
    Ingest a document into the Reservoir.
    
    Extracts text content from PDFs and text files.
    Deduplicates based on content hash.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Read file content
    file_bytes = await file.read()
    file_size_bytes = len(file_bytes)
    
    # Compute hash for deduplication
    content_hash = compute_content_hash(file_bytes)
    
    # Check for duplicate
    existing = db.query(ReservoirDocument).filter(
        ReservoirDocument.user_id == current_user.id,
        ReservoirDocument.content_hash == content_hash
    ).first()
    
    if existing:
        return IngestResponse(
            id=str(existing.id),
            name=existing.name,
            file_type=existing.file_type,
            file_size=existing.file_size or "",
            is_processed=existing.is_processed,
            message="Document already exists in Reservoir"
        )
    
    # Determine file type
    content_type = file.content_type or ""
    filename_lower = file.filename.lower()
    
    if filename_lower.endswith(".pdf"):
        file_type = "pdf"
    elif filename_lower.endswith(".txt"):
        file_type = "txt"
    elif filename_lower.endswith(".md"):
        file_type = "md"
    else:
        file_type = "other"
    
    # Extract text
    extracted_text = None
    is_processed = False
    processing_error = None
    
    try:
        if file_type == "pdf":
            extracted_text = extract_text_from_pdf(file_bytes)
            is_processed = True
        elif file_type in ["txt", "md"]:
            try:
                extracted_text = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                extracted_text = file_bytes.decode("latin-1")
            is_processed = True
        else:
            # Try to decode as text
            try:
                extracted_text = file_bytes.decode("utf-8")
                is_processed = True
            except:
                processing_error = "Could not extract text from file"
    except Exception as e:
        processing_error = str(e)
    
    # Create document record
    doc = ReservoirDocument(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=file.filename,
        original_filename=file.filename,
        file_type=file_type,
        file_size=format_file_size(file_size_bytes),
        file_size_bytes=str(file_size_bytes),
        content_hash=content_hash,
        extracted_text=extracted_text,
        is_processed=is_processed,
        processing_error=processing_error,
    )
    
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    logger.info(f"Document ingested into Reservoir: {doc.name} (user: {current_user.id})")
    
    return IngestResponse(
        id=str(doc.id),
        name=doc.name,
        file_type=doc.file_type,
        file_size=doc.file_size or "",
        is_processed=doc.is_processed,
        message="Document ingested successfully"
    )


@router.post("/ingest-multiple")
async def ingest_multiple_documents(
    current_user: Annotated[CurrentUser, Depends(get_required_user)],
    db: Session = Depends(get_db),
    files: List[UploadFile] = File(...),
):
    """
    Ingest multiple documents into the Reservoir.
    """
    results = []
    
    for file in files:
        try:
            result = await ingest_document(current_user, db, file)
            results.append(result.model_dump())
        except HTTPException as e:
            results.append({
                "id": None,
                "name": file.filename,
                "file_type": None,
                "file_size": None,
                "is_processed": False,
                "message": f"Error: {e.detail}"
            })
    
    return {
        "documents": results,
        "total_ingested": sum(1 for r in results if r.get("id")),
        "total_failed": sum(1 for r in results if not r.get("id"))
    }


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user: Annotated[CurrentUser, Depends(get_required_user)],
    db: Session = Depends(get_db),
):
    """
    Delete a document from the Reservoir.
    """
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID format")
    
    doc = db.query(ReservoirDocument).filter(
        ReservoirDocument.id == doc_uuid,
        ReservoirDocument.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    db.delete(doc)
    db.commit()
    
    logger.info(f"Document deleted from Reservoir: {doc.name} (user: {current_user.id})")
    
    return {"message": "Document deleted successfully", "id": document_id}

