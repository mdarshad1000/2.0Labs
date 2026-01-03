from typing import List, Optional
import re
from models.document import Document, DocChunk


class DocumentRetriever:
    """Document fallback retrieval when matrix is insufficient."""
    
    def __init__(self, chunk_size: int = 2000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def _chunk_document(self, doc: Document) -> List[DocChunk]:
        """Split document into overlapping chunks."""
        content = doc.content
        chunks = []
        
        # Try to split on paragraph boundaries
        paragraphs = re.split(r'\n\s*\n', content)
        current_chunk = ""
        current_section = None
        
        for para in paragraphs:
            # Detect section headers
            header_match = re.match(r'^#+\s*(.+)$|^([A-Z][A-Z\s]+)$', para.strip())
            if header_match:
                current_section = header_match.group(1) or header_match.group(2)
            
            if len(current_chunk) + len(para) > self.chunk_size:
                if current_chunk:
                    chunks.append(DocChunk(
                        doc_id=doc.id,
                        doc_name=doc.name,
                        content=current_chunk.strip(),
                        section=current_section
                    ))
                current_chunk = para
            else:
                current_chunk += "\n\n" + para if current_chunk else para
        
        # Add final chunk
        if current_chunk:
            chunks.append(DocChunk(
                doc_id=doc.id,
                doc_name=doc.name,
                content=current_chunk.strip(),
                section=current_section
            ))
        
        return chunks
    
    def _score_chunk_relevance(self, chunk: DocChunk, query_terms: List[str]) -> float:
        """Score chunk relevance to query."""
        content_lower = chunk.content.lower()
        score = 0.0
        
        for term in query_terms:
            # Count occurrences
            count = content_lower.count(term.lower())
            if count > 0:
                score += min(count * 0.2, 1.0)
        
        # Boost if term in section header
        if chunk.section:
            section_lower = chunk.section.lower()
            for term in query_terms:
                if term.lower() in section_lower:
                    score += 0.5
        
        return min(score, 1.0)
    
    def retrieve(
        self,
        query: str,
        documents: List[Document],
        max_chunks: int = 5,
        min_relevance: float = 0.2
    ) -> List[DocChunk]:
        """
        Retrieve relevant document chunks for a query.
        
        Only called when matrix data is insufficient.
        """
        # Extract query terms
        query_terms = [w.strip() for w in query.lower().split() if len(w) > 3]
        
        all_chunks: List[DocChunk] = []
        
        for doc in documents:
            chunks = self._chunk_document(doc)
            for chunk in chunks:
                chunk.relevance_score = self._score_chunk_relevance(chunk, query_terms)
                if chunk.relevance_score >= min_relevance:
                    all_chunks.append(chunk)
        
        # Sort by relevance and return top chunks
        all_chunks.sort(key=lambda c: c.relevance_score, reverse=True)
        return all_chunks[:max_chunks]
    
    def format_for_context(self, chunks: List[DocChunk]) -> str:
        """Format document chunks for LLM context."""
        if not chunks:
            return "No relevant document sections found."
        
        lines = ["RELEVANT DOCUMENT SECTIONS:"]
        for i, chunk in enumerate(chunks, 1):
            section_info = f" (Section: {chunk.section})" if chunk.section else ""
            lines.append(f"\n[Doc {i}] (doc_id={chunk.doc_id}) {chunk.doc_name}{section_info}")
            lines.append(f"Content: {chunk.content[:]}...")
        
        return "\n".join(lines)

