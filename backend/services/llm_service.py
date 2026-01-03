"""
LLM Service Factory - Manages switching between OpenAI and Gemini providers.
"""
from typing import Optional, List, AsyncGenerator

from core.config import settings
from .openai_service import openai_service
from .gemini import gemini_service



class LLMService:
    """Unified LLM service that can switch between providers."""
    
    def __init__(self):
        self.provider = settings.llm.llm_provider.lower()
        self._service = None
    
    def _get_service(self):
        """Get the active LLM service based on provider setting."""
        if self._service is None:
            if self.provider == "gemini":
                self._service = gemini_service
            else:  # Default to OpenAI
                self._service = openai_service
        return self._service
    
    async def extract_metric(self, document_content: str, metric_label: str, on_step=None):
        """Extract a metric value from document content."""
        return await self._get_service().extract_metric(document_content, metric_label, on_step)
    
    async def infer_metrics(self, doc_snippets: list[dict]) -> list[str]:
        """Infer schema metrics from document corpus."""
        return await self._get_service().infer_metrics(doc_snippets)
    
    async def chat_with_context(
        self,
        query: str,
        matrix_context: str,
        document_context: str,
        chat_history: str
    ) -> dict:
        """Generate analytical chat response with citations."""
        return await self._get_service().chat_with_context(
            query, matrix_context, document_context, chat_history
        )
    
    async def chat_with_context_stream(
        self,
        query: str,
        matrix_context: str,
        document_context: str,
        chat_history: str
    ) -> AsyncGenerator[dict, None]:
        """Stream analytical chat response with citations."""
        async for chunk in self._get_service().chat_with_context_stream(
            query, matrix_context, document_context, chat_history
        ):
            yield chunk
    
    async def generate_chart_spec(
        self,
        metric_label: str,
        unit: Optional[str],
        values: List[float],
        time_index: Optional[List[str]],
        variance_stats: dict,
        matrix_visible: bool = True,
        chart_requested: bool = False,
        related_columns: Optional[List[str]] = None
    ) -> dict:
        """
        Generate chart specification using the Analytical Chart Orchestrator.
        
        Delegates to the active LLM provider (OpenAI or Gemini) to make
        intelligent decisions about whether and how to visualize a column.
        
        Args:
            metric_label: The column/metric label
            unit: Unit type (percentage, currency, multiple, numeric)
            values: List of numeric values
            time_index: Optional list of time labels
            variance_stats: Dict with keys like 'mean', 'stdev', 'cv', 'min', 'max'
            matrix_visible: Whether values are visible in the matrix
            chart_requested: Whether user explicitly requested a chart
            related_columns: Names of related columns in the matrix
            
        Returns:
            Dict conforming to LLMChartSpec schema
        """
        return await self._get_service().generate_chart_spec(
            metric_label=metric_label,
            unit=unit,
            values=values,
            time_index=time_index,
            variance_stats=variance_stats,
            matrix_visible=matrix_visible,
            chart_requested=chart_requested,
            related_columns=related_columns
        )
    
    def set_provider(self, provider: str):
        """Switch LLM provider (openai or gemini)."""
        provider = provider.lower()
        if provider not in ["openai", "gemini"]:
            raise ValueError(f"Invalid provider: {provider}. Must be 'openai' or 'gemini'")
        self.provider = provider
        self._service = None  # Reset to force re-initialization


# Global LLM service instance
llm_service = LLMService()

