from typing import Dict, List, Optional
from datetime import datetime
import uuid

from models.document import Document
from models.matrix import CellData, Metric
from models.chat import ChatMessage


class StateStore:
    """In-memory state store for documents, matrix cells, and chat history."""
    
    def __init__(self):
        self._documents: Dict[str, Document] = {}
        self._cells: Dict[str, CellData] = {}  # keyed by "docId-metricId"
        self._metrics: Dict[str, Metric] = {}
        self._chat_history: Dict[str, List[ChatMessage]] = {}  # keyed by session_id
    
    # Document operations
    def add_document(self, doc: Document) -> None:
        self._documents[doc.id] = doc
    
    def get_document(self, doc_id: str) -> Optional[Document]:
        return self._documents.get(doc_id)
    
    def get_all_documents(self) -> List[Document]:
        return list(self._documents.values())
    
    def remove_document(self, doc_id: str) -> bool:
        if doc_id in self._documents:
            del self._documents[doc_id]
            # Also remove associated cells
            keys_to_remove = [k for k in self._cells.keys() if k.startswith(f"{doc_id}-")]
            for key in keys_to_remove:
                del self._cells[key]
            return True
        return False
    
    def sync_documents(self, documents: List[dict]) -> None:
        """Sync documents from frontend state."""
        self._documents.clear()
        for doc_data in documents:
            doc = Document(
                id=doc_data.get("id", ""),
                name=doc_data.get("name", ""),
                type=doc_data.get("type", ""),
                content=doc_data.get("content", ""),
                size=doc_data.get("size", 0),
                blob_url=doc_data.get("blobUrl")
            )
            self._documents[doc.id] = doc
    
    # Cell operations
    def set_cell(self, doc_id: str, metric_id: str, cell: CellData) -> None:
        key = f"{doc_id}-{metric_id}"
        self._cells[key] = cell
    
    def get_cell(self, doc_id: str, metric_id: str) -> Optional[CellData]:
        key = f"{doc_id}-{metric_id}"
        return self._cells.get(key)
    
    def get_all_cells(self) -> Dict[str, CellData]:
        return self._cells.copy()
    
    def sync_cells(self, cells: Dict[str, dict]) -> None:
        """Sync cells from frontend state."""
        self._cells.clear()
        for key, cell_data in cells.items():
            self._cells[key] = CellData(
                value=cell_data.get("value"),
                is_loading=cell_data.get("isLoading", False),
                confidence=cell_data.get("confidence"),
                reasoning=cell_data.get("reasoning"),
                sources=cell_data.get("sources"),
                error=cell_data.get("error")
            )
    
    # Metric operations
    def set_metric(self, metric: Metric) -> None:
        self._metrics[metric.id] = metric
    
    def get_metric(self, metric_id: str) -> Optional[Metric]:
        return self._metrics.get(metric_id)
    
    def get_all_metrics(self) -> List[Metric]:
        return list(self._metrics.values())
    
    def sync_metrics(self, metrics: List[dict]) -> None:
        """Sync metrics from frontend state."""
        self._metrics.clear()
        for m in metrics:
            metric = Metric(
                id=m.get("id", ""),
                label=m.get("label", ""),
                description=m.get("description"),
                type=m.get("type")
            )
            self._metrics[metric.id] = metric
    
    # Chat history operations
    def add_chat_message(self, session_id: str, message: ChatMessage) -> None:
        if session_id not in self._chat_history:
            self._chat_history[session_id] = []
        self._chat_history[session_id].append(message)
    
    def get_chat_history(self, session_id: str, limit: int = 20) -> List[ChatMessage]:
        history = self._chat_history.get(session_id, [])
        return history[-limit:]
    
    def clear_chat_history(self, session_id: str) -> None:
        if session_id in self._chat_history:
            self._chat_history[session_id] = []
    
    def sync_context(self, matrix_context: dict) -> None:
        """Sync full matrix context from frontend."""
        self.sync_documents(matrix_context.get("documents", []))
        self.sync_metrics(matrix_context.get("metrics", []))
        self.sync_cells(matrix_context.get("cells", {}))


# Global store instance
store = StateStore()

