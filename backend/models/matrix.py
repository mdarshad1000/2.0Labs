from pydantic import BaseModel
from typing import Optional, Literal, Dict, List


class Metric(BaseModel):
    id: str
    label: str
    description: Optional[str] = None
    type: Optional[Literal['numeric', 'qualitative', 'binary']] = None


class CellData(BaseModel):
    value: Optional[str] = None
    is_loading: bool = False
    confidence: Optional[Literal['High', 'Medium', 'Exploratory']] = None
    reasoning: Optional[str] = None
    sources: Optional[List[str]] = None
    error: Optional[str] = None


class CellMatch(BaseModel):
    doc_id: str
    doc_name: str
    metric_id: str
    metric_label: str
    cell: CellData
    relevance_score: float = 0.0


class MatrixContext(BaseModel):
    documents: List[Dict]
    metrics: List[Metric]
    cells: Dict[str, CellData]  # keyed by "docId-metricId"

