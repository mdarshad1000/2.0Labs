from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any

import sys
sys.path.append("..")

from services.visualization import visualization_service
from services.analytical_questions import analytical_questions_service
from core.logfire_config import log_error, log_info, log_warning

router = APIRouter(prefix="/api", tags=["visualization"])


class MetricInput(BaseModel):
    id: str
    label: str
    description: Optional[str] = None


class VisualizationRequest(BaseModel):
    metrics: List[MetricInput]
    cells: Dict[str, Dict]  # keyed by "docId-metricId"


class ColumnAnalysis(BaseModel):
    visualizable: bool
    data_type: Optional[str] = None
    cardinality: int
    values: List[float] = []
    value_doc_indices: List[int] = []
    unit_type: Optional[str] = None
    chart_type: Optional[str] = None
    intent: Optional[str] = None
    intent_confidence: float = 0.0
    reveals_info: bool = False
    info_reason: Optional[str] = None
    insight: Optional[str] = None
    llm_powered: bool = False  # Indicates if LLM made the chart decision
    error: Optional[str] = None


class VisualizationResponse(BaseModel):
    columns: Dict[str, ColumnAnalysis]  # keyed by metric_id


@router.post("/visualize-columns", response_model=VisualizationResponse)
async def analyze_columns(request: VisualizationRequest):
    """
    Analyze matrix columns to determine visualization metadata using LLM-driven chart orchestration.
    
    For each metric, the LLM Chart Orchestrator determines:
    - Whether a chart should render (based on analytical value, not aesthetics)
    - The primary analytical question the chart answers
    - The analytical intent (trend, distribution, comparison, delta, relationship, composition)
    - The optimal chart type to answer the question
    - A single insight annotation
    
    Falls back to rule-based logic if LLM is unavailable or times out.
    """
    try:
        metrics_dict = [{"id": m.id, "label": m.label} for m in request.metrics]
        
        # Use async LLM-powered analysis
        results = await visualization_service.analyze_matrix_async(metrics_dict, request.cells)
        
        # Convert to response format
        columns = {}
        for metric_id, analysis in results.items():
            # Filter out any extra keys not in the model
            filtered_analysis = {
                k: v for k, v in analysis.items() 
                if k in ColumnAnalysis.model_fields
            }
            columns[metric_id] = ColumnAnalysis(**filtered_analysis)
        
        # Log summary
        llm_count = sum(1 for a in results.values() if a.get('llm_powered', False))
        total_count = len(results)
        log_info("Visualization analysis complete", total_columns=total_count, llm_powered_count=llm_count)
        
        return VisualizationResponse(columns=columns)
    except Exception as e:
        log_error("Visualization analysis failed", error=e)
        raise HTTPException(status_code=500, detail=f"Visualization analysis failed: {str(e)}")


# ============= ANALYTICAL QUESTIONS ENDPOINTS =============

class DocumentInput(BaseModel):
    id: str
    name: str


class MatrixContextRequest(BaseModel):
    documents: List[DocumentInput]
    metrics: List[MetricInput]
    cells: Dict[str, Dict]


class AnalyticalQuestion(BaseModel):
    id: str
    question: str
    intent: str
    metrics_involved: List[str] = []
    entities_involved: List[str] = []
    visualization_hint: Optional[str] = None


class QuestionsResponse(BaseModel):
    questions: List[AnalyticalQuestion]


class AnswerQuestionRequest(BaseModel):
    question: AnalyticalQuestion
    documents: List[DocumentInput]
    metrics: List[MetricInput]
    cells: Dict[str, Dict]


class VisualizationSpec(BaseModel):
    type: str
    title: str
    x_axis: Optional[Dict[str, Any]] = None
    y_axis: Optional[Dict[str, Any]] = None
    data: List[Dict[str, Any]] = []
    insight: Optional[str] = None


class AnswerResponse(BaseModel):
    answer_summary: str
    visualization: Optional[VisualizationSpec] = None
    error: Optional[str] = None


@router.post("/analytical-questions", response_model=QuestionsResponse)
async def generate_analytical_questions(request: MatrixContextRequest):
    """
    Generate analytical questions based on the matrix data.
    
    Analyzes the entire matrix and returns 3-5 meaningful questions that
    reveal insights, comparisons, trends, or anomalies worth visualizing.
    """
    try:
        documents = [{"id": d.id, "name": d.name} for d in request.documents]
        metrics = [{"id": m.id, "label": m.label} for m in request.metrics]
        
        questions = await analytical_questions_service.generate_questions(
            documents=documents,
            metrics=metrics,
            cells=request.cells
        )
        
        # Convert to response format
        formatted_questions = []
        for q in questions:
            formatted_questions.append(AnalyticalQuestion(
                id=q.get('id', ''),
                question=q.get('question', ''),
                intent=q.get('intent', 'COMPARISON'),
                metrics_involved=q.get('metrics_involved', []),
                entities_involved=q.get('entities_involved', []),
                visualization_hint=q.get('visualization_hint')
            ))
        
        log_info("Generated analytical questions", count=len(formatted_questions))
        return QuestionsResponse(questions=formatted_questions)
        
    except Exception as e:
        log_error("Question generation failed", error=e)
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")


@router.post("/answer-question", response_model=AnswerResponse)
async def answer_analytical_question(request: AnswerQuestionRequest):
    """
    Generate a visualization that answers a specific analytical question.
    
    The LLM analyzes the matrix data in context of the question and generates
    the most appropriate visualization to communicate the answer.
    """
    try:
        question = {
            "id": request.question.id,
            "question": request.question.question,
            "intent": request.question.intent,
            "metrics_involved": request.question.metrics_involved,
            "entities_involved": request.question.entities_involved
        }
        documents = [{"id": d.id, "name": d.name} for d in request.documents]
        metrics = [{"id": m.id, "label": m.label} for m in request.metrics]
        
        result = await analytical_questions_service.answer_question(
            question=question,
            documents=documents,
            metrics=metrics,
            cells=request.cells
        )
        
        # Convert visualization to response format
        viz = result.get('visualization')
        viz_spec = None
        if viz:
            viz_spec = VisualizationSpec(
                type=viz.get('type', 'LOLLIPOP'),
                title=viz.get('title', ''),
                x_axis=viz.get('x_axis'),
                y_axis=viz.get('y_axis'),
                data=viz.get('data', []),
                insight=viz.get('insight')
            )
        
        log_info("Generated visualization for question", question_preview=request.question.question[:50])
        return AnswerResponse(
            answer_summary=result.get('answer_summary', ''),
            visualization=viz_spec,
            error=result.get('error')
        )
        
    except Exception as e:
        log_error("Answer generation failed", error=e)
        raise HTTPException(status_code=500, detail=f"Answer generation failed: {str(e)}")

