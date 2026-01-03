from typing import List, Dict, Optional
from models.matrix import CellData, CellMatch, Metric
from models.document import Document


class MatrixRetriever:
    """Matrix-first retrieval logic."""
    
    def __init__(self):
        # Common semantic mappings for query understanding
        self.semantic_mappings = {
            "revenue": ["revenue", "arr", "mrr", "sales", "income", "earnings"],
            "margin": ["margin", "profit", "gross margin", "net margin", "profitability"],
            "growth": ["growth", "delta", "change", "increase", "yoy"],
            "leader": ["leadership", "ceo", "executive", "management", "founder"],
            "risk": ["risk", "threat", "challenge", "exposure"],
            "churn": ["churn", "retention", "attrition", "customer loss"],
            "valuation": ["valuation", "pe", "price", "multiple", "cap"],
            "debt": ["debt", "leverage", "loan", "liability"],
            "cash": ["cash", "fcf", "free cash flow", "liquidity"],
            "employee": ["employee", "headcount", "staff", "workforce"],
        }
    
    def _normalize_query(self, query: str) -> List[str]:
        """Extract key terms from query for matching."""
        query_lower = query.lower()
        matched_concepts = []
        
        for concept, keywords in self.semantic_mappings.items():
            if any(kw in query_lower for kw in keywords):
                matched_concepts.append(concept)
        
        # Also include raw words from query
        words = [w.strip().lower() for w in query_lower.split() if len(w) > 3]
        return list(set(matched_concepts + words))
    
    def _score_metric_relevance(self, metric_label: str, query_terms: List[str]) -> float:
        """Score how relevant a metric is to the query."""
        label_lower = metric_label.lower()
        score = 0.0
        
        for term in query_terms:
            if term in label_lower:
                score += 1.0
            # Check semantic mappings
            for concept, keywords in self.semantic_mappings.items():
                if term == concept and any(kw in label_lower for kw in keywords):
                    score += 0.8
        
        return min(score, 1.0)  # Cap at 1.0
    
    def retrieve(
        self,
        query: str,
        cells: Dict[str, CellData],
        metrics: List[Metric],
        documents: List[Document],
        min_relevance: float = 0.3
    ) -> List[CellMatch]:
        """
        Retrieve relevant matrix cells for a query.
        
        Returns cells sorted by relevance score.
        """
        query_terms = self._normalize_query(query)
        matches: List[CellMatch] = []
        
        # Build doc lookup
        doc_lookup = {doc.id: doc for doc in documents}
        
        for metric in metrics:
            relevance = self._score_metric_relevance(metric.label, query_terms)
            
            if relevance >= min_relevance:
                # Find all cells for this metric
                for cell_key, cell in cells.items():
                    if f"-{metric.id}" in cell_key and cell.value and cell.value != "—":
                        doc_id = cell_key.split(f"-{metric.id}")[0]
                        doc = doc_lookup.get(doc_id)
                        
                        if doc:
                            matches.append(CellMatch(
                                doc_id=doc_id,
                                doc_name=doc.name,
                                metric_id=metric.id,
                                metric_label=metric.label,
                                cell=cell,
                                relevance_score=relevance
                            ))
        
        # Sort by relevance
        matches.sort(key=lambda m: m.relevance_score, reverse=True)
        return matches
    
    def has_sufficient_data(self, matches: List[CellMatch], threshold: int = 2) -> bool:
        """Check if matrix has enough data to answer without document fallback."""
        high_confidence = [m for m in matches if m.cell.confidence == "High"]
        return len(high_confidence) >= threshold or len(matches) >= threshold * 2
    
    def format_for_context(self, matches: List[CellMatch]) -> str:
        """Format cell matches for LLM context."""
        if not matches:
            return "No relevant matrix cells found."
        
        lines = ["RELEVANT MATRIX CELLS:"]
        for i, match in enumerate(matches[:], 1):  # Limit to top 10
            lines.append(
                f"[Cell {i}] (doc_id={match.doc_id}, metric_id={match.metric_id}) "
                f"{match.doc_name} → {match.metric_label}: "
                f"{match.cell.value} (Confidence: {match.cell.confidence})"
            )
            if match.cell.reasoning:
                lines.append(f"   Reasoning: {match.cell.reasoning[:]}...")
        
        return "\n".join(lines)

