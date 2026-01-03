"""
Pydantic models for LLM-driven chart orchestration.

These models validate the structured JSON response from the LLM chart orchestrator
and provide type safety for the visualization pipeline.
"""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, model_validator


class AxisSpec(BaseModel):
    """Axis specification with semantic metadata."""
    label: str = Field(..., description="Human-readable axis label")
    semantic: Optional[str] = Field(None, description="Semantic meaning (e.g., Year, Time, Entity)")
    unit: Optional[str] = Field(None, description="Unit of measurement (EUR, %, ratio)")


class ChartAxes(BaseModel):
    """X and Y axis specifications."""
    x: AxisSpec
    y: AxisSpec


# Valid intent types from the LLM orchestrator
LLMIntentType = Literal["TREND", "DELTA", "RELATIONSHIP", "COMPARISON", "DISTRIBUTION", "COMPOSITION"]

# Valid chart types from the LLM orchestrator
LLMChartType = Literal["LINE", "AREA", "SLOPE", "SCATTER", "BOX", "HISTOGRAM", "WATERFALL", "LOLLIPOP", "DELTA_BAR"]

# Valid emphasis options
EmphasisType = Literal["slope", "inflection", "volatility", "deltas", "correlation", "magnitude", "outliers"]


class LLMChartSpec(BaseModel):
    """
    Full chart specification returned by the LLM orchestrator.
    
    When should_render is False, all other fields should be None/empty.
    When should_render is True, intent and chart_type are required.
    """
    should_render: bool = Field(..., description="Whether a chart should be rendered")
    reason: Optional[str] = Field(None, description="Reason when should_render is False")
    primary_question: Optional[str] = Field(None, description="The analytical question the chart answers")
    intent: Optional[LLMIntentType] = Field(None, description="Analytical intent category")
    chart_type: Optional[LLMChartType] = Field(None, description="Chart type to render")
    axes: Optional[ChartAxes] = Field(None, description="Axis specifications")
    emphasis: Optional[List[str]] = Field(None, description="What the visualization should emphasize")
    insight: Optional[str] = Field(None, description="Single insight annotation")
    placement: Optional[Literal["SIDE_RAIL"]] = Field("SIDE_RAIL", description="Where to render the chart")

    @model_validator(mode='after')
    def validate_render_fields(self):
        """Ensure required fields are present when should_render is True."""
        if self.should_render:
            if not self.intent:
                raise ValueError("intent is required when should_render is True")
            if not self.chart_type:
                raise ValueError("chart_type is required when should_render is True")
        return self


# Mapping from LLM chart types to frontend chart types
LLM_TO_FRONTEND_CHART_TYPE = {
    "LINE": "line",
    "AREA": "area",
    "SLOPE": "slope",
    "SCATTER": "scatter",
    "BOX": "boxplot",
    "HISTOGRAM": "histogram",
    "WATERFALL": "delta_bar",  # Map waterfall to delta_bar (closest equivalent)
    "LOLLIPOP": "lollipop",
    "DELTA_BAR": "delta_bar",
}

# Mapping from LLM intent to frontend intent
LLM_TO_FRONTEND_INTENT = {
    "TREND": "trend",
    "DELTA": "delta",
    "RELATIONSHIP": "relationship",
    "COMPARISON": "comparison",
    "DISTRIBUTION": "distribution",
    "COMPOSITION": "composition",
}


class ChartOrchestratorInput(BaseModel):
    """
    Input payload for the chart orchestrator LLM.
    
    This structures the data we send to the LLM for chart decision-making.
    """
    metric_label: str = Field(..., description="Column/metric label")
    unit: Optional[str] = Field(None, description="Unit type (EUR, %, ratio, count, etc.)")
    semantic_type: Optional[str] = Field(None, description="Inferred semantic type")
    values: List[float] = Field(..., description="Numeric values in the column")
    time_index: Optional[List[str]] = Field(None, description="Time labels if temporal data")
    cardinality: int = Field(..., description="Number of data points")
    variance_stats: dict = Field(default_factory=dict, description="Variance/spread statistics")
    matrix_visible: bool = Field(True, description="Whether values are visible in matrix")
    chart_requested: bool = Field(False, description="Whether user explicitly requested chart")
    related_columns: Optional[List[str]] = Field(None, description="Names of related columns")


