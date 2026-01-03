from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

import sys
sys.path.append("..")

from services.llm_service import llm_service

router = APIRouter(prefix="/api", tags=["inference"])


class DocSnippetInput(BaseModel):
    name: str
    content: str


class InferRequest(BaseModel):
    doc_snippets: List[DocSnippetInput]


class InferResponse(BaseModel):
    metrics: List[str]


@router.post("/infer-schema", response_model=InferResponse)
async def infer_schema(request: InferRequest):
    """
    Infer schema metrics from document corpus.
    
    Migrated from frontend geminiService.ts
    """
    try:
        snippets = [{"name": s.name, "content": s.content} for s in request.doc_snippets]
        metrics = await llm_service.infer_metrics(snippets)
        return InferResponse(metrics=metrics)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema inference failed: {str(e)}")

