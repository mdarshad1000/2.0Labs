from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

import sys
sys.path.append("..")

from services.llm_service import llm_service

router = APIRouter(prefix="/api", tags=["extraction"])


class ExtractionRequest(BaseModel):
    doc_content: str
    metric_label: str


class ExtractionResult(BaseModel):
    value: str
    reasoning: str
    confidence: str
    sources: List[str]


@router.post("/extract", response_model=ExtractionResult)
async def extract_metric(request: ExtractionRequest):
    """
    Extract a metric value from document content.
    
    Migrated from frontend geminiService.ts
    """
    try:
        result = await llm_service.extract_metric(
            document_content=request.doc_content,
            metric_label=request.metric_label
        )
        return ExtractionResult(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

