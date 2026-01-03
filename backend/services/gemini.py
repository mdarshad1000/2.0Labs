import json
import re
from typing import Optional, Callable, List, AsyncGenerator

from core.config import settings


# Chart Orchestrator System Prompt - encodes analytical philosophy
CHART_ORCHESTRATOR_SYSTEM_PROMPT = """You are an Analytical Visualization Orchestrator for a professional financial research platform.

Your job is not to visualize data by default.
Your job is to decide whether a chart is warranted, what question it answers, and how it should be rendered so that it reveals insight that is not obvious from a table alone.

You must prioritize cognitive value over visual minimalism.

The matrix is the primary surface. Charts are secondary analytical lenses.

Input You Will Receive

You will be given a structured JSON payload containing:

metric metadata:
- column label
- unit (EUR, %, ratio, count, etc.)
- inferred semantic type

data characteristics:
- values
- time index (if any)
- cardinality
- variance / spread statistics

matrix context:
- whether values are already easily comparable in tabular form
- whether related columns exist

user context:
- chart explicitly requested (yes/no)
- comparison context (if any)

Your Responsibilities (Strict)

You must perform the following steps in order:

1️⃣ Decide Whether a Chart Should Exist

Before proposing any visualization, answer internally:

"Does a chart reveal something a human would not immediately notice by scanning the matrix?"

If the answer is no, return:

{
  "should_render": false,
  "reason": "Matrix already communicates this information clearly"
}

Do NOT invent a chart for aesthetic reasons.

2️⃣ Determine the Primary Analytical Question (PAQ)

If a chart is warranted, define one and only one primary analytical question, such as:

"Is this metric accelerating, decelerating, or flat over time?"
"Did a material change occur between periods?"
"Are these two metrics correlated or decoupled?"
"Is this distribution unusually dispersed or clustered?"
"Is performance improving relative to scale?"

This question must be explicit and concise.

3️⃣ Resolve Analytical Intent (Question-Driven)

Based on the PAQ (not just data type), select one intent:

TREND
DELTA
RELATIONSHIP
COMPARISON
DISTRIBUTION
COMPOSITION

Rules:
- If a time index exists, TREND or DELTA should usually take precedence.
- DISTRIBUTION should never be the default unless no temporal or relational structure exists.

4️⃣ Select the Chart Type (Opinionated)

Choose the chart type that best answers the PAQ.

Allowed chart types:
LINE
AREA
SLOPE
SCATTER
BOX
HISTOGRAM
WATERFALL
LOLLIPOP
DELTA_BAR

Constraints:
- Never use bar charts to show time-based trends.
- Prefer slope / delta visuals over magnitude comparisons.
- Avoid chart types that merely restate numeric values.

5️⃣ Specify Axis Semantics Explicitly

For every chart, define:

X-axis:
- semantic meaning (e.g. Year, Time, Entity)

Y-axis:
- unit (EUR, %, ratio)
- scale intent (emphasize change vs magnitude)

Do not remove axes if doing so harms interpretability.
Minimalism must never erase meaning.

6️⃣ Define Visual Emphasis (What the Eye Should Notice)

Specify what the visualization should emphasize:
- slope
- inflection
- volatility
- deltas
- correlation
- magnitude
- outliers

This must directly answer the PAQ.

7️⃣ Provide a Single Insight Annotation (Optional but Preferred)

If possible, provide one muted insight sentence, e.g.:

"Asset growth plateaus after 2022 while revenue continues to rise."
"Profit volatility increases post-2021."

This is not a summary.
It is an observation.

8️⃣ Respect the Matrix

Charts must:
- never obscure matrix cells
- be rendered in a side rail or secondary plane
- allow simultaneous visibility of chart and highlighted cells

The matrix is sacred.

Output Format (Strict JSON)

Return a single JSON object:

{
  "should_render": true,
  "primary_question": "...",
  "intent": "TREND | DELTA | RELATIONSHIP | COMPARISON | DISTRIBUTION | COMPOSITION",
  "chart_type": "LINE | AREA | SLOPE | SCATTER | BOX | HISTOGRAM | WATERFALL | LOLLIPOP | DELTA_BAR",
  "axes": {
    "x": { "label": "...", "semantic": "..." },
    "y": { "label": "...", "unit": "..." }
  },
  "emphasis": ["slope", "inflection"],
  "insight": "optional one-line observation",
  "placement": "SIDE_RAIL"
}

If should_render is false, only include should_render and reason fields.

Core Philosophy (Never Violate)

- Do not visualize data just because it exists.
- Do not optimize for visual appeal.
- Do not compete with the matrix.
- Always answer a question.
- When in doubt, show nothing.

You are not building charts.
You are helping a human notice something they would otherwise miss."""


class GeminiService:
    """Wrapper for Google Gemini API."""
    
    _instance = None
    _initialized = False
    
    def __init__(self):
        self.flash_model = None
        self.pro_model = None
        self._api_key = None
    
    def _ensure_initialized(self):
        """Lazy initialization of the Gemini models."""
        if self._initialized:
            return
        
        import google.generativeai as genai
        
        self._api_key = settings.api_keys.require_gemini()
        genai.configure(api_key=self._api_key)
        # Use same models as frontend for consistency
        self.flash_model = genai.GenerativeModel('gemini-2.5-flash')
        self._initialized = True
    
    def _parse_json_response(self, text: str) -> dict:
        """Clean and parse JSON from model response."""
        # Remove markdown code blocks if present
        cleaned = re.sub(r'```json\n?|```', '', text).strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            print(f"JSON Parse Error: {e}, Raw text: {text[:500]}")
            raise ValueError("Invalid JSON response from model")
    
    async def extract_metric(
        self, 
        document_content: str, 
        metric_label: str,
        on_step: Optional[Callable[[str], None]] = None
    ) -> dict:
        """Extract a metric value from document content."""
        self._ensure_initialized()
        
        if on_step:
            on_step(f'Analyzing context for "{metric_label}"...')
        
        prompt = f"""
ROLE: Expert Data Extraction Engine.
TASK: Extract information for the pillar: "{metric_label}".

DOCUMENT CONTENT:
{document_content[:60000]}

EXTRACTION PROTOCOL:
1. TYPE DETECTION: Is "{metric_label}" requesting a person (Leadership), a fiscal figure (Revenue), or a qualitative status?
2. EXHAUSTIVE SEARCH: Locate exact or semantically similar headers.
3. QUANTITATIVE: If numerical, find the latest value and preserve units ($, %, etc.).
4. QUALITATIVE: If text-based (like names), synthesize into a clean, comma-separated list or short summary.
5. ABSENCE: If no data exists for "{metric_label}", set value to "NOT_FOUND".

MANDATORY: Return ONLY a valid JSON object with these fields:
- value: string (the extracted value or "NOT_FOUND")
- reasoning: string (explanation of how value was found)
- confidence: "High" | "Medium" | "Exploratory"
- sources: array of strings (relevant excerpts from document)
"""
        
        response = await self.flash_model.generate_content_async(prompt)
        data = self._parse_json_response(response.text)
        
        if data.get("value") == "NOT_FOUND":
            return {
                "value": "—",
                "reasoning": f'The document does not contain explicit or implicit information regarding "{metric_label}".',
                "confidence": "Exploratory",
                "sources": []
            }
        
        if on_step:
            on_step(f'Synthesized value: {str(data.get("value", ""))[:15]}...')
        
        return {
            "value": data.get("value", "—"),
            "reasoning": data.get("reasoning", "Extracted via neural pattern matching."),
            "confidence": data.get("confidence", "Medium"),
            "sources": data.get("sources", [])
        }
    
    async def infer_metrics(self, doc_snippets: list[dict]) -> list[str]:
        """Infer schema metrics from document corpus."""
        self._ensure_initialized()
        
        corpus_preview = "\n---\n".join([
            f"[SOURCE: {doc['name']}]\n{doc['content'][:12000]}"
            for doc in doc_snippets
        ])
        
        prompt = f"""
Analyze this collection of documents. 
Synthesize exactly 6 critical comparison pillars (columns) that represent the core information available across this ENTIRE batch.

CORPUS:
{corpus_preview[:]}

CRITERIA:
- Mix qualitative (e.g. Leadership, Strategy, Risk) and quantitative (e.g. Revenue, Growth, Margin).
- Ensure pillars are distinct and comparison-ready.
- Return ONLY a JSON object with a "metrics" array of strings.
"""
        
        try:
            import google.generativeai as genai
            
            # Use structured output with JSON schema
            response = await self.flash_model.generate_content_async(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "object",
                        "properties": {
                            "metrics": {
                                "type": "array",
                                "items": {"type": "string"}
                            }
                        },
                        "required": ["metrics"]
                    }
                )
            )
            
            print(f"Raw response text: {response.text[:500]}...")  # Debug: show first 500 chars
            data = self._parse_json_response(response.text)
            print(f"Parsed data: {data}")  # Debug: show parsed data
            metrics = data.get("metrics", [])
            if metrics and len(metrics) > 0:
                print(f"✓ Successfully inferred {len(metrics)} metrics: {metrics}")
                return metrics
            else:
                print(f"⚠ Warning: Empty or invalid metrics array. Data keys: {data.keys() if isinstance(data, dict) else 'N/A'}")
        except Exception as e:
            import traceback
            print(f"✗ Inference Error: {e}")
            print(f"Response text (if available): {getattr(response, 'text', 'N/A')[:500]}")
            traceback.print_exc()
        
        # Return empty list - let frontend handle empty state
        print("ERROR: Failed to infer metrics from documents. Returning empty list.")
        return []
    
    async def chat_with_context(
        self,
        query: str,
        matrix_context: str,
        document_context: str,
        chat_history: str
    ) -> dict:
        """Generate analytical chat response with citations."""
        self._ensure_initialized()
        
        prompt = f"""
ROLE: You are a senior analytical assistant for a matrix-based document analysis tool.
Your responses must be concise, structured, and grounded in the provided data.

BEHAVIOR RULES:
1. MATRIX-FIRST: Always prioritize data from the matrix cells. Reference them explicitly.
2. DOCUMENT FALLBACK: Only use document excerpts if matrix doesn't have sufficient info.
3. CITATIONS: Every factual claim MUST have an inline citation using ONLY simple numbers like [1], [2], etc.
4. HONESTY: If you cannot answer confidently, say so. Never fabricate data.

CRITICAL - CITATION FORMAT IN RESPONSE TEXT:
- In your "response" field, ONLY use simple bracketed numbers: [1], [2], [3], etc.
- NEVER include raw IDs or parenthetical info in the response text
- BAD: "The paper [Doc 1] (doc_id=N_6F03AD) discusses..."
- GOOD: "The paper [1] discusses..."

MATRIX STATE (prioritize this):
{matrix_context}

DOCUMENT EXCERPTS (use only if matrix insufficient):
{document_context}

RECENT CHAT:
{chat_history}

USER QUERY: {query}

RESPONSE FORMAT (JSON):
{{
  "response": "Your analytical response with inline citations like [1], [2]...",
  "citations": [
    {{"index": 1, "type": "cell", "doc_id": "...", "metric_id": "...", "value": "..."}},
    {{"index": 2, "type": "document", "doc_id": "...", "section": "...", "excerpt": "..."}}
  ],
  "confidence": "High" | "Medium" | "Low",
  "matrix_cells_used": number,
  "documents_searched": number
}}
"""
        
        response = await self.flash_model.generate_content_async(prompt)
        return self._parse_json_response(response.text)

    async def chat_with_context_stream(
        self,
        query: str,
        matrix_context: str,
        document_context: str,
        chat_history: str
    ) -> AsyncGenerator[dict, None]:
        """Stream analytical chat response, then yield citations at end."""
        self._ensure_initialized()
        
        prompt = f"""You are a senior analytical assistant for a matrix-based document analysis tool.
Your responses must be concise, structured, and grounded in the provided data.

Use inline citations like [1], [2], etc. for factual claims.

MATRIX STATE (prioritize this):
{matrix_context}

DOCUMENT EXCERPTS (use only if matrix insufficient):
{document_context}

RECENT CHAT:
{chat_history}

USER QUERY: {query}

Respond naturally with inline citations [1], [2], etc. referencing the data above."""

        # Stream the response
        response = await self.flash_model.generate_content_async(prompt, stream=True)
        
        full_response = ""
        async for chunk in response:
            if chunk.text:
                full_response += chunk.text
                yield {"type": "text", "content": chunk.text}
        
        # Generate citations separately
        citation_prompt = f"""Based on this response and context, provide citations as JSON.

RESPONSE: {full_response}

MATRIX CONTEXT: {matrix_context}

DOCUMENT CONTEXT: {document_context}

Return ONLY a JSON object: {{"citations": [
  {{"index": 1, "type": "cell" or "document", "doc_id": "...", "doc_name": "...", ...}}
]}}"""

        try:
            citation_response = await self.flash_model.generate_content_async(citation_prompt)
            citation_data = self._parse_json_response(citation_response.text)
            yield {"type": "citations", "citations": citation_data.get("citations", [])}
        except Exception:
            yield {"type": "citations", "citations": []}

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
        
        This method calls the LLM to make intelligent decisions about whether
        and how to visualize a column of data.
        
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
        self._ensure_initialized()
        
        import google.generativeai as genai
        
        # Build the structured input payload
        input_payload = {
            "metric_metadata": {
                "column_label": metric_label,
                "unit": unit or "numeric",
                "inferred_semantic_type": self._infer_semantic_type(metric_label, unit)
            },
            "data_characteristics": {
                "values": values[:50],  # Limit to first 50 for token efficiency
                "value_count": len(values),
                "time_index": time_index[:50] if time_index else None,
                "cardinality": len(set(values)),
                "variance_stats": variance_stats
            },
            "matrix_context": {
                "values_easily_comparable": matrix_visible and len(values) <= 10,
                "related_columns_exist": bool(related_columns),
                "related_columns": related_columns[:5] if related_columns else []
            },
            "user_context": {
                "chart_explicitly_requested": chart_requested,
                "comparison_context": None
            }
        }
        
        prompt = f"""{CHART_ORCHESTRATOR_SYSTEM_PROMPT}

---

Analyze this column and decide whether a chart should be rendered.

INPUT:
{json.dumps(input_payload, indent=2)}

Remember:
- Only render a chart if it reveals something not obvious from scanning the matrix
- If cardinality is low and values are easily comparable, prefer no chart
- Always specify the primary analytical question if rendering

Return your response as valid JSON."""

        try:
            # Use structured output with JSON schema for Gemini
            response = await self.flash_model.generate_content_async(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.2  # Low temperature for deterministic output
                )
            )
            
            return self._parse_json_response(response.text)
            
        except Exception as e:
            print(f"Chart orchestrator error: {e}")
            # Return a default "no render" response on error
            return {
                "should_render": False,
                "reason": f"LLM error: {str(e)}"
            }
    
    def _infer_semantic_type(self, metric_label: str, unit: Optional[str]) -> str:
        """Infer the semantic type from metric label and unit."""
        label_lower = metric_label.lower()
        
        # Financial metrics
        if any(kw in label_lower for kw in ['revenue', 'income', 'profit', 'ebitda', 'margin']):
            return "financial_metric"
        
        # Growth/change metrics
        if any(kw in label_lower for kw in ['growth', 'change', 'delta', 'yoy', 'qoq']):
            return "growth_metric"
        
        # Ratio metrics
        if unit == 'multiple' or any(kw in label_lower for kw in ['ratio', 'multiple', 'leverage']):
            return "ratio_metric"
        
        # Percentage metrics
        if unit == 'percentage' or '%' in metric_label:
            return "percentage_metric"
        
        # Count/volume metrics
        if any(kw in label_lower for kw in ['count', 'number', 'volume', 'units']):
            return "count_metric"
        
        return "general_numeric"


# Global service instance
gemini_service = GeminiService()

