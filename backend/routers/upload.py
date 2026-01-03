"""File upload router with PDF text extraction using PyMuPDF."""
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
import fitz  # PyMuPDF


router = APIRouter(prefix="/api", tags=["upload"])


class UploadResponse(BaseModel):
    id: str
    name: str
    type: str
    size: int
    content: str


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
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload a document and extract text content.
    
    Supports PDF files (via PyMuPDF) and text-based files.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Read file content
    file_bytes = await file.read()
    file_size = len(file_bytes)
    
    # Determine content type
    content_type = file.content_type or ""
    filename_lower = file.filename.lower()
    
    # Extract text based on file type
    if content_type == "application/pdf" or filename_lower.endswith(".pdf"):
        content = extract_text_from_pdf(file_bytes)
    elif content_type.startswith("text/") or filename_lower.endswith((".txt", ".csv", ".json", ".md", ".xml")):
        # Text-based files - decode directly
        try:
            content = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                content = file_bytes.decode("latin-1")
            except:
                raise HTTPException(status_code=400, detail="Could not decode text file")
    else:
        # Try to decode as text, fall back to error
        try:
            content = file_bytes.decode("utf-8")
        except:
            raise HTTPException(
                status_code=400, 
                detail=f"Unsupported file type: {content_type}. Only PDF and text files are supported."
            )
    
    # Generate unique ID
    doc_id = f"N_{uuid.uuid4().hex[:6].upper()}"
    
    return UploadResponse(
        id=doc_id,
        name=file.filename,
        type=content_type or "application/octet-stream",
        size=file_size,
        content=content
    )


@router.post("/upload-multiple")
async def upload_multiple_documents(files: list[UploadFile] = File(...)):
    """Upload multiple documents and extract text content from each."""
    results = []
    
    for file in files:
        try:
            result = await upload_document(file)
            results.append(result.model_dump())
        except HTTPException as e:
            results.append({
                "id": None,
                "name": file.filename,
                "type": file.content_type,
                "size": 0,
                "content": "",
                "error": e.detail
            })
    
    return {"documents": results}

