from typing import List, Union
from models.chat import Citation, CellCitation, DocumentCitation
from models.matrix import CellMatch
from models.document import DocChunk


class CitationGenerator:
    """Generate and manage citations for chat responses."""
    
    def __init__(self):
        self._citation_index = 0
    
    def reset(self):
        """Reset citation index for new response."""
        self._citation_index = 0
    
    def create_cell_citation(self, match: CellMatch) -> CellCitation:
        """Create a citation from a matrix cell match."""
        self._citation_index += 1
        return CellCitation(
            index=self._citation_index,
            doc_id=match.doc_id,
            doc_name=match.doc_name,
            metric_id=match.metric_id,
            metric_label=match.metric_label,
            value=match.cell.value or ""
        )
    
    def create_document_citation(self, chunk: DocChunk) -> DocumentCitation:
        """Create a citation from a document chunk."""
        self._citation_index += 1
        return DocumentCitation(
            index=self._citation_index,
            doc_id=chunk.doc_id,
            doc_name=chunk.doc_name,
            section=chunk.section,
            page=chunk.page,
            excerpt=chunk.content[:]
        )
    
    def build_citations_from_matches(
        self,
        cell_matches: List[CellMatch],
        doc_chunks: List[DocChunk]
    ) -> List[Citation]:
        """Build citation list from all sources."""
        self.reset()
        citations: List[Citation] = []
        
        # Add cell citations first (matrix-first)
        for match in cell_matches:
            citations.append(self.create_cell_citation(match))
        
        # Then document citations
        for chunk in doc_chunks:
            citations.append(self.create_document_citation(chunk))
        
        return citations
    
    def format_citation_reference(self, citations: List[Citation]) -> str:
        """Format citations as reference list for display."""
        if not citations:
            return ""
        
        lines = ["\n---\nREFERENCES:"]
        for citation in citations:
            if citation.type == "cell":
                lines.append(
                    f"[{citation.index}] Matrix Cell: {citation.doc_name} → {citation.metric_label}"
                )
            else:
                section = f" ({citation.section})" if citation.section else ""
                lines.append(
                    f"[{citation.index}] Document: {citation.doc_name}{section}"
                )
        
        return "\n".join(lines)

