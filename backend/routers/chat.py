from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional, AsyncGenerator
from datetime import datetime
import uuid
import re
import json

import sys
sys.path.append("..")

from models.chat import (
    ChatRequest, ChatResponse, ChatMessage, 
    Citation, CellCitation, DocumentCitation
)
from models.matrix import Metric
from models.document import Document
from services.llm_service import llm_service
from services.matrix_retriever import MatrixRetriever
from services.document_retriever import DocumentRetriever
from services.citation import CitationGenerator
from state.store import store

router = APIRouter(prefix="/api", tags=["chat"])

# Initialize services
matrix_retriever = MatrixRetriever()
document_retriever = DocumentRetriever()
citation_generator = CitationGenerator()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Matrix-first analytical chat endpoint.
    
    1. Syncs matrix context from frontend
    2. Retrieves from matrix first
    3. Falls back to documents if needed
    4. Generates response with citations
    5. Suggests hydration opportunities
    """
    try:
        # Sync context from frontend
        store.sync_context(request.matrix_context)
        
        # Get current state
        documents = store.get_all_documents()
        metrics = store.get_all_metrics()
        cells = store.get_all_cells()
        
        # Convert cells to proper format
        cells_dict = {k: v for k, v in cells.items()}
        
        # Step 1: Matrix-first retrieval
        cell_matches = matrix_retriever.retrieve(
            query=request.query,
            cells=cells_dict,
            metrics=metrics,
            documents=documents
        )
        
        matrix_context = matrix_retriever.format_for_context(cell_matches)
        matrix_sufficient = matrix_retriever.has_sufficient_data(cell_matches)
        
        # Step 2: Document fallback if needed
        doc_chunks = []
        if not matrix_sufficient:
            doc_chunks = document_retriever.retrieve(
                query=request.query,
                documents=documents,
                max_chunks=5
            )
        
        document_context = document_retriever.format_for_context(doc_chunks)
        
        # Step 3: Get chat history
        chat_history = store.get_chat_history(request.session_id, limit=10)
        history_text = "\n".join([
            f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}"
            for m in chat_history[-6:]  # Last 6 messages for context
        ])
        
        # Step 4: Store user message
        user_message = ChatMessage(
            id=str(uuid.uuid4()),
            role="user",
            content=request.query,
            timestamp=datetime.now()
        )
        store.add_chat_message(request.session_id, user_message)
        
        # Build citation index map from context
        # cell_matches indices correspond to [Cell 1], [Cell 2], etc.
        # doc_chunks indices correspond to [Doc 1], [Doc 2], etc.
        # Map all available cell_matches and doc_chunks, not just the first 10/5
        cell_map = {i: match for i, match in enumerate(cell_matches, 1)}
        doc_map = {i: chunk for i, chunk in enumerate(doc_chunks, 1)}
        
        # Step 5: Generate response with LLM (OpenAI by default, Gemini as fallback)
        llm_response = await llm_service.chat_with_context(
            query=request.query,
            matrix_context=matrix_context,
            document_context=document_context,
            chat_history=history_text
        )
        
        # Step 6: Parse and structure response
        raw_content = llm_response.get("response", "I was unable to generate a response.")
        raw_citations = llm_response.get("citations", [])
        
        # Enrich citations with actual IDs from context maps
        enriched_citations = _enrich_citations(raw_citations, cell_map, doc_map)
        
        # Normalize citations: ensure text references match citation indices
        content, citations = _normalize_citations(raw_content, enriched_citations)
        
        assistant_message = ChatMessage(
            id=str(uuid.uuid4()),
            role="assistant",
            content=content,
            timestamp=datetime.now(),
            citations=citations
        )
        
        # Store assistant message
        store.add_chat_message(request.session_id, assistant_message)
        
        return ChatResponse(
            message=assistant_message,
            matrix_cells_used=llm_response.get("matrix_cells_used", len(cell_matches)),
            documents_searched=llm_response.get("documents_searched", len(doc_chunks)),
            confidence=llm_response.get("confidence", "Medium")
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Streaming version of chat endpoint using Server-Sent Events.
    Streams text tokens, then sends citations at the end.
    """
    async def generate() -> AsyncGenerator[str, None]:
        try:
            # Sync context from frontend
            store.sync_context(request.matrix_context)
            
            # Get current state
            documents = store.get_all_documents()
            metrics = store.get_all_metrics()
            cells = store.get_all_cells()
            cells_dict = {k: v for k, v in cells.items()}
            
            # Matrix-first retrieval
            cell_matches = matrix_retriever.retrieve(
                query=request.query,
                cells=cells_dict,
                metrics=metrics,
                documents=documents
            )
            matrix_context = matrix_retriever.format_for_context(cell_matches)
            matrix_sufficient = matrix_retriever.has_sufficient_data(cell_matches)
            
            # Document fallback if needed
            doc_chunks = []
            if not matrix_sufficient:
                doc_chunks = document_retriever.retrieve(
                    query=request.query,
                    documents=documents,
                    max_chunks=5
                )
            document_context = document_retriever.format_for_context(doc_chunks)
            
            # Get chat history
            chat_history = store.get_chat_history(request.session_id, limit=10)
            history_text = "\n".join([
                f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}"
                for m in chat_history[-6:]
            ])
            
            # Store user message
            user_message = ChatMessage(
                id=str(uuid.uuid4()),
                role="user",
                content=request.query,
                timestamp=datetime.now()
            )
            store.add_chat_message(request.session_id, user_message)
            
            # Build citation maps
            cell_map = {i: match for i, match in enumerate(cell_matches, 1)}
            doc_map = {i: chunk for i, chunk in enumerate(doc_chunks, 1)}
            
            # Stream from LLM
            full_content = ""
            raw_citations = []
            
            async for chunk in llm_service.chat_with_context_stream(
                query=request.query,
                matrix_context=matrix_context,
                document_context=document_context,
                chat_history=history_text
            ):
                if chunk.get("type") == "text":
                    text = chunk.get("content", "")
                    full_content += text
                    yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
                elif chunk.get("type") == "citations":
                    raw_citations = chunk.get("citations", [])
            
            # Process citations
            enriched_citations = _enrich_citations(raw_citations, cell_map, doc_map)
            content, citations = _normalize_citations(full_content, enriched_citations)
            
            # Send final message with citations
            message_id = str(uuid.uuid4())
            assistant_message = ChatMessage(
                id=message_id,
                role="assistant",
                content=content,
                timestamp=datetime.now(),
                citations=citations
            )
            store.add_chat_message(request.session_id, assistant_message)
            
            # Send citations and done signal
            citations_data = [c.model_dump() if hasattr(c, 'model_dump') else dict(c) for c in citations]
            yield f"data: {json.dumps({'type': 'citations', 'citations': citations_data})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'message_id': message_id})}\n\n"
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


def _enrich_citations(raw_citations: List[dict], cell_map: dict, doc_map: dict) -> List[dict]:
    """
    Enrich citations with actual IDs from the context we provided to the LLM.
    
    The LLM might return citations with:
    - Correct IDs (if it parsed them from context)
    - Placeholder IDs like "..." or empty strings
    - Context indices like "[Cell 1]" or index numbers
    
    This function maps them back to actual IDs.
    """
    enriched = []
    
    for c in raw_citations:
        citation = dict(c)  # Copy to avoid mutation
        
        if citation.get("type") == "cell":
            # Try to find the cell by index or by matching doc_id/metric_id
            idx = citation.get("index", 0)
            doc_id = citation.get("doc_id", "")
            metric_id = citation.get("metric_id", "")
            
            # If IDs look like placeholders, try to get from cell_map
            if not doc_id or doc_id == "..." or len(doc_id) < 5:
                if idx in cell_map:
                    match = cell_map[idx]
                    citation["doc_id"] = match.doc_id
                    citation["doc_name"] = match.doc_name
                    citation["metric_id"] = match.metric_id
                    citation["metric_label"] = match.metric_label
                    citation["value"] = match.cell.value if match.cell else ""
                elif len(cell_map) > 0:
                    # Fallback to first matching cell
                    first_match = list(cell_map.values())[min(idx - 1, len(cell_map) - 1)] if idx > 0 else list(cell_map.values())[0]
                    citation["doc_id"] = first_match.doc_id
                    citation["doc_name"] = first_match.doc_name
                    citation["metric_id"] = first_match.metric_id
                    citation["metric_label"] = first_match.metric_label
                    citation["value"] = first_match.cell.value if first_match.cell else ""
        
        elif citation.get("type") == "document":
            idx = citation.get("index", 0)
            doc_id = citation.get("doc_id", "")
            
            # If doc_id looks like a placeholder, try to get from doc_map
            if not doc_id or doc_id == "..." or len(doc_id) < 5:
                if idx in doc_map:
                    chunk = doc_map[idx]
                    citation["doc_id"] = chunk.doc_id
                    citation["doc_name"] = chunk.doc_name
                    citation["section"] = chunk.section
                    citation["excerpt"] = chunk.content[:] if chunk.content else ""
                elif len(doc_map) > 0:
                    # Fallback to first doc
                    first_chunk = list(doc_map.values())[min(idx - 1, len(doc_map) - 1)] if idx > 0 else list(doc_map.values())[0]
                    citation["doc_id"] = first_chunk.doc_id
                    citation["doc_name"] = first_chunk.doc_name
                    citation["section"] = first_chunk.section
                    citation["excerpt"] = first_chunk.content[:] if first_chunk.content else ""
        
        enriched.append(citation)
    
    return enriched


def _clean_citation_leakage(content: str) -> str:
    """
    Clean up any raw citation metadata that leaked into the response text.
    
    The LLM sometimes outputs things like:
    - "[Doc 1] (doc_id=N_6F03AD)" instead of just "[1]"
    - "[Cell 2] (doc_id=xxx, metric_id=yyy)" instead of just "[2]"
    
    This function cleans these up to simple [n] format.
    """
    # Pattern to match [Doc N] or [Cell N] with optional parenthetical metadata
    # Examples: "[Doc 1] (doc_id=N_6F03AD)", "[Cell 2] (doc_id=xxx, metric_id=yyy)"
    pattern = r'\[(Doc|Cell)\s*(\d+)\]\s*\([^)]*\)'
    content = re.sub(pattern, r'[\2]', content)
    
    # Also clean up partial leakage like "[Doc 1]" without parentheses (should be [1])
    pattern2 = r'\[(Doc|Cell)\s*(\d+)\]'
    content = re.sub(pattern2, r'[\2]', content)
    
    # Clean up any remaining (doc_id=...) or (doc_id=..., metric_id=...) that got separated
    content = re.sub(r'\s*\(doc_id=[^)]*\)', '', content)
    
    return content


def _normalize_citations(content: str, raw_citations: List[dict]) -> tuple[str, List[Citation]]:
    """
    Normalize citations to ensure text references match citation indices.
    
    The LLM sometimes outputs [3], [4], [5] in text but returns citations with indices 1, 2, 3.
    This function:
    1. Cleans up any leaked raw citation metadata from content
    2. Finds all [n] references in the text
    3. Maps them to citations (by matching index or by order)
    4. Renumbers everything to be sequential starting from 1
    """
    # First, clean up any leaked citation metadata
    content = _clean_citation_leakage(content)
    
    # Find all [n] references in the text, in order of appearance
    ref_pattern = r'\[(\d+)\]'
    refs_in_text = re.findall(ref_pattern, content)
    unique_refs = []
    for ref in refs_in_text:
        if ref not in unique_refs:
            unique_refs.append(ref)
    
    if not unique_refs or not raw_citations:
        return content, _parse_citations(raw_citations)
    
    # Build a mapping from old index to citation data
    citation_by_index = {}
    for c in raw_citations:
        idx = c.get("index")
        if idx is not None:
            citation_by_index[str(idx)] = c
    
    # Also keep citations in order as fallback
    citations_in_order = list(raw_citations)
    
    # Create new normalized citations and replacement map
    normalized_citations = []
    old_to_new = {}  # Maps old ref number to new index
    
    for new_index, old_ref in enumerate(unique_refs, start=1):
        # Try to find matching citation by index
        citation_data = citation_by_index.get(old_ref)
        
        # Fallback: use citation by order of appearance
        if citation_data is None and len(citations_in_order) >= new_index:
            citation_data = citations_in_order[new_index - 1]
        
        if citation_data is None:
            # No citation found for this reference - skip
            continue
        
        old_to_new[old_ref] = new_index
        
        # Create the citation with the new index
        try:
            if citation_data.get("type") == "cell":
                normalized_citations.append(CellCitation(
                    index=new_index,
                    doc_id=citation_data.get("doc_id", ""),
                    doc_name=citation_data.get("doc_name", "Unknown"),
                    metric_id=citation_data.get("metric_id", ""),
                    metric_label=citation_data.get("metric_label", "Unknown"),
                    value=citation_data.get("value", "")
                ))
            elif citation_data.get("type") == "document":
                normalized_citations.append(DocumentCitation(
                    index=new_index,
                    doc_id=citation_data.get("doc_id", ""),
                    doc_name=citation_data.get("doc_name", "Unknown"),
                    section=citation_data.get("section"),
                    page=citation_data.get("page"),
                    excerpt=citation_data.get("excerpt", "")
                ))
        except Exception:
            continue
    
    # Replace references in text with new indices
    def replace_ref(match):
        old_ref = match.group(1)
        new_idx = old_to_new.get(old_ref)
        if new_idx is not None:
            return f"[{new_idx}]"
        return match.group(0)  # Keep original if no mapping
    
    normalized_content = re.sub(ref_pattern, replace_ref, content)
    
    return normalized_content, normalized_citations


def _parse_citations(raw_citations: List[dict]) -> List[Citation]:
    """Parse raw citation dicts into typed Citation objects."""
    citations = []
    for i, c in enumerate(raw_citations, start=1):
        try:
            if c.get("type") == "cell":
                citations.append(CellCitation(
                    index=i,  # Always use sequential index
                    doc_id=c.get("doc_id", ""),
                    doc_name=c.get("doc_name", "Unknown"),
                    metric_id=c.get("metric_id", ""),
                    metric_label=c.get("metric_label", "Unknown"),
                    value=c.get("value", "")
                ))
            elif c.get("type") == "document":
                citations.append(DocumentCitation(
                    index=i,  # Always use sequential index
                    doc_id=c.get("doc_id", ""),
                    doc_name=c.get("doc_name", "Unknown"),
                    section=c.get("section"),
                    page=c.get("page"),
                    excerpt=c.get("excerpt", "")
                ))
        except Exception:
            continue
    return citations


class ClearHistoryRequest(BaseModel):
    session_id: str


@router.post("/chat/clear")
async def clear_chat_history(request: ClearHistoryRequest):
    """Clear chat history for a session."""
    store.clear_chat_history(request.session_id)
    return {"status": "ok"}

