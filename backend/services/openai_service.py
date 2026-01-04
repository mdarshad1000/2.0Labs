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


class OpenAIService:
    """Wrapper for OpenAI API."""
    
    _instance = None
    _initialized = False
    
    def __init__(self):
        self.client = None
        self._api_key = None
    
    def _ensure_initialized(self):
        """Lazy initialization of the OpenAI client."""
        if self._initialized:
            return
        
        from openai import AsyncOpenAI
        
        self._api_key = settings.api_keys.require_openai()
        self.client = AsyncOpenAI(api_key=self._api_key)
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
{document_content[:]}

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
        
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini-mini",
            messages=[
                {"role": "system", "content": "You are an expert data extraction engine. Always return valid JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        
        content = response.choices[0].message.content
        data = self._parse_json_response(content)
        
        if data.get("value") == "NOT_FOUND":
            return {
                "value": "—",
                "reasoning": f'The document does not contain explicit or implicit information regarding "{metric_label}".',
                "confidence": "Exploratory",
                "sources": []
            }
        
        if on_step:
            on_step(f'Synthesized value: {str(data.get("value", ""))[:]}...')
        
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
            f"[SOURCE: {doc['name']}]\n{doc['content'][:120000]}"
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
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini-mini",
                messages=[
                    {"role": "system", "content": "You are an expert at analyzing documents and synthesizing comparison metrics. Always return valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.5
            )
            
            content = response.choices[0].message.content
            print(f"Raw response text: {content[:500]}...")  # Debug: show first 500 chars
            data = self._parse_json_response(content)
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
        
        system_prompt = """You are a senior analytical assistant for a matrix-based document analysis tool.
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
- The citation details go in the "citations" array, NOT in the response text.

Always return valid JSON."""
        
        user_prompt = f"""
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
    {{"index": 1, "type": "cell", "doc_id": "COPY_EXACT_DOC_ID_FROM_CONTEXT", "doc_name": "doc name", "metric_id": "COPY_EXACT_METRIC_ID_FROM_CONTEXT", "metric_label": "metric name", "value": "the cell value"}},
    {{"index": 2, "type": "document", "doc_id": "COPY_EXACT_DOC_ID_FROM_CONTEXT", "doc_name": "doc name", "section": "section name", "excerpt": "relevant excerpt"}}
  ],
  "confidence": "High" | "Medium" | "Low",
  "matrix_cells_used": number,
  "documents_searched": number
}}

IMPORTANT: Use the exact doc_id and metric_id values from the context above (found in parentheses like doc_id=xxx, metric_id=yyy). Never use placeholder "..." values.
"""
        
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.7
        )
        
        content = response.choices[0].message.content
        return self._parse_json_response(content)

    async def chat_with_context_stream(
        self,
        query: str,
        matrix_context: str,
        document_context: str,
        chat_history: str
    ) -> AsyncGenerator[dict, None]:
        """Stream analytical chat response, then yield citations at end."""
        self._ensure_initialized()
        
        system_prompt = """You are a senior analytical assistant for a matrix-based document analysis tool.
Your responses must be concise, structured, and grounded in the provided data.

BEHAVIOR RULES:
1. MATRIX-FIRST: Always prioritize data from the matrix cells.
2. DOCUMENT FALLBACK: Only use document excerpts if matrix doesn't have sufficient info.
3. CITATIONS: Use inline citations like [1], [2], etc. for factual claims.
4. HONESTY: If you cannot answer confidently, say so.

Use simple bracketed numbers [1], [2], [3] for citations in your response."""
        
        user_prompt = f"""
MATRIX STATE (prioritize this):
{matrix_context}

DOCUMENT EXCERPTS (use only if matrix insufficient):
{document_context}

RECENT CHAT:
{chat_history}

USER QUERY: {query}

Respond naturally with inline citations [1], [2], etc. referencing the data above."""

        # Stream the text response
        stream = await self.client.chat.completions.create(
            model="gpt-4o-mini-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            stream=True
        )
        
        full_response = ""
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                text = chunk.choices[0].delta.content
                full_response += text
                yield {"type": "text", "content": text}
        
        # Now generate citations in a separate call
        citation_prompt = f"""Based on this response and context, provide citations.

RESPONSE: {full_response}

MATRIX CONTEXT: {matrix_context}

DOCUMENT CONTEXT: {document_context}

Return ONLY a JSON object with a "citations" array. Each citation should have:
- index: the number in [N] from the response
- type: "cell" or "document"  
- doc_id: exact ID from context
- doc_name: document name
- For cells: metric_id, metric_label, value
- For documents: section, excerpt

Return: {{"citations": [...]}}"""

        citation_response = await self.client.chat.completions.create(
            model="gpt-4o-mini-mini",
            messages=[{"role": "user", "content": citation_prompt}],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        
        try:
            citation_data = self._parse_json_response(citation_response.choices[0].message.content)
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
        
        user_prompt = f"""Analyze this column and decide whether a chart should be rendered.

INPUT:
{json.dumps(input_payload, indent=2)}

Remember:
- Only render a chart if it reveals something not obvious from scanning the matrix
- If cardinality is low and values are easily comparable, prefer no chart
- Always specify the primary analytical question if rendering"""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini-mini",
                messages=[
                    {"role": "system", "content": CHART_ORCHESTRATOR_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.2  # Low temperature for deterministic output
            )
            
            content = response.choices[0].message.content
            return self._parse_json_response(content)
            
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

    # ═══════════════════════════════════════════════════════════════
    # GRAPH/ATLAS VIEW - Research Node Generation
    # ═══════════════════════════════════════════════════════════════

    async def generate_graph_nodes(
        self,
        query: str,
        documents: List[dict]
    ) -> dict:
        """
        Generate research graph nodes from a query and document context.
        
        Args:
            query: The research question/query
            documents: List of dicts with 'name' and 'content' keys
            
        Returns:
            Dict with 'nodes' array, each node has title, content[], color
        """
        self._ensure_initialized()
        
        doc_content = "\n\n---\n\n".join([
            f"Document: {doc['name']}\nContent: {doc['content'][:8000]}"
            for doc in documents
        ])
        
        system_prompt = """You are a research assistant that synthesizes information into structured knowledge nodes.
Your task is to create visual research nodes that answer queries based on document context.

Each node should:
- Have a clear, concise title (max 8 words)
- Contain key insights (use markdown bullet points for lists)
- Be assigned a color based on its nature:
  - 'green' for positive findings, growth, opportunities
  - 'blue' for neutral facts, data points, descriptions
  - 'yellow' for important highlights, key metrics
  - 'red' for risks, challenges, concerns

Always return valid JSON."""

        user_prompt = f"""Query: {query}

Document Context:
{doc_content}

Create 2-4 research nodes that comprehensively answer the query.
Each node should represent a distinct aspect or theme from the documents.

Return JSON format:
{{
  "nodes": [
    {{
      "title": "Node Title",
      "content": "Bullet point 1\nBullet point 2\nBullet point 3",
      "color": "green" | "blue" | "yellow" | "red"
    }}
  ]
}}"""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.7
            )
            
            content = response.choices[0].message.content
            return self._parse_json_response(content)
            
        except Exception as e:
            print(f"Graph generation error: {e}")
            return {
                "nodes": [{
                    "title": "Error",
                    "content": f"Failed to generate nodes: {str(e)}",
                    "color": "red"
                }]
            }

    async def expand_graph_node(
        self,
        node_title: str,
        node_content: str,
        documents: List[dict],
        query: Optional[str] = None
    ) -> dict:
        """
        Expand a node into more detailed sub-nodes.
        
        Args:
            node_title: Title of the node to expand
            node_content: Current content of the node
            documents: Document context
            query: Optional specific research query for expansion
            
        Returns:
            Dict with 'nodes' array of child nodes
        """
        self._ensure_initialized()
        
        doc_content = "\n\n---\n\n".join([
            f"Document: {doc['name']}\nContent: {doc['content'][:6000]}"
            for doc in documents
        ])
        
        system_prompt = """You are a research assistant that expands knowledge nodes into more detailed sub-topics.
Break down the parent node into 2-3 more specific, detailed child nodes.

Each child node should:
- Drill deeper into a specific aspect of the parent
- Provide new insights not already in the parent
- Be assigned an appropriate color

Always return valid JSON."""

        expansion_directive = f"Focus the expansion on this specific query: {query}" if query else "Create 2-3 child nodes that expand on different aspects of the parent node."

        user_prompt = f"""Parent Node:
Title: {node_title}
Content: {', '.join(node_content)}

Document Context:
{doc_content}

{expansion_directive}

Return JSON format:
{{
  "nodes": [
    {{
      "title": "Child Node Title",
      "content": "Detailed point 1\nDetailed point 2",
      "color": "green" | "blue" | "yellow" | "red"
    }}
  ]
}}"""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.7
            )
            
            content = response.choices[0].message.content
            return self._parse_json_response(content)
            
        except Exception as e:
            print(f"Node expansion error: {e}")
            return {"nodes": []}

    async def merge_graph_nodes(
        self,
        nodes: List[dict]
    ) -> dict:
        """
        Synthesize multiple nodes into a single summary node.
        
        Args:
            nodes: List of nodes with 'title' and 'content' keys
            
        Returns:
            Dict with single 'node' containing synthesized information
        """
        self._ensure_initialized()
        
        nodes_text = "\n---\n".join([
            f"Title: {n['title']}\nContent: {n['content']}"
            for n in nodes
        ])
        
        system_prompt = """You are a research assistant that synthesizes multiple knowledge nodes into cohesive summaries.
Combine the key insights from all nodes into a single, comprehensive node.

The merged node should:
- Have a title that captures the overarching theme
- Synthesize (not just list) the key points
- Identify connections between the original nodes
- Be assigned a color that reflects the overall nature

Always return valid JSON."""

        user_prompt = f"""Nodes to merge:
{nodes_text}

Create one synthesized node that combines insights from all the above nodes.

Return JSON format:
{{
  "node": {{
    "title": "Synthesized Title",
    "content": "Synthesized point 1\nSynthesized point 2\nSynthesized point 3",
    "color": "green" | "blue" | "yellow" | "red"
  }}
}}"""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.7
            )
            
            content = response.choices[0].message.content
            return self._parse_json_response(content)
            
        except Exception as e:
            print(f"Node merge error: {e}")
            return {
                "node": {
                    "title": "Merge Failed",
                    "content": f"Error: {str(e)}",
                    "color": "red"
                }
            }

    async def create_node_from_prompt(
        self,
        prompt: str,
        parent_node: Optional[dict],
        documents: List[dict]
    ) -> dict:
        """
        Create a new node from a custom prompt, optionally connected to a parent.
        
        Args:
            prompt: User's prompt for what the node should contain
            parent_node: Optional parent node for context
            documents: Document context
            
        Returns:
            Dict with single 'node'
        """
        self._ensure_initialized()
        
        doc_content = "\n\n---\n\n".join([
            f"Document: {doc['name']}\nContent: {doc['content'][:6000]}"
            for doc in documents
        ]) if documents else "No documents provided."
        
        parent_context = ""
        if parent_node:
            parent_context = f"""
Parent Node Context:
Title: {parent_node.get('title', 'N/A')}
Content: {parent_node.get('content', '')}

The new node should be related to or extend from this parent."""

        system_prompt = """You are a research assistant that creates knowledge nodes based on user prompts.
Create a focused, informative node based on the user's request.

The node should:
- Have a clear, descriptive title
- Contain relevant, detailed insights (use markdown bullet points for lists)
- Be grounded in the document context when available
- Be assigned an appropriate color

Always return valid JSON."""

        user_prompt = f"""User Request: {prompt}
{parent_context}

Document Context:
{doc_content}

Create a single node based on the user's request.

Return JSON format:
{{
  "node": {{
    "title": "Node Title",
    "content": "Point 1\nPoint 2\nPoint 3",
    "color": "green" | "blue" | "yellow" | "red"
  }}
}}"""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.7
            )
            
            content = response.choices[0].message.content
            return self._parse_json_response(content)
            
        except Exception as e:
            print(f"Node creation error: {e}")
            return {
                "node": {
                    "title": "Creation Failed",
                    "content": f"Error: {str(e)}",
                    "color": "red"
                }
            }

    async def stream_graph_nodes(
        self,
        query: str,
        documents: List[dict]
    ):
        """
        Stream research graph nodes one at a time as they're generated.
        The number of nodes is dynamically determined by GPT based on the query and documents.
        
        Args:
            query: The research question/query
            documents: List of dicts with 'name' and 'content' keys
            
        Yields:
            Dict with single node data (title, content[], color)
        """
        self._ensure_initialized()
        
        doc_count = len(documents)
        doc_names = ", ".join([doc['name'] for doc in documents])
        doc_content = "\n\n---\n\n".join([
            f"Document: {doc['name']}\nContent: {doc['content'][:6000]}"
            for doc in documents
        ])
        
        # First, get a dynamic plan based on query and documents
        plan_prompt = f"""Query: {query}

Number of documents: {doc_count}
Document names: {doc_names}

Document Content:
{doc_content}

Analyze this query and documents to determine the OPTIMAL structure for research nodes.
Create a plan with the RIGHT number of nodes (could be 1-8 nodes) based on:

- If summarizing multiple documents: consider one node per document, or group by theme
- If analyzing/reviewing: create nodes for different aspects (pros, cons, summary, recommendations, etc.)
- If comparing: create nodes for each comparison dimension
- If asking a specific question: create nodes that build toward answering it
- Keep it focused - only create nodes that add value

Return JSON:
{{
  "reasoning": "Brief explanation of why this structure makes sense",
  "plan": [
    {{"title": "Node Title", "focus": "What this node will cover", "color_hint": "green/blue/yellow/red based on content type"}}
  ]
}}"""

        try:
            # Get the dynamic plan first
            plan_response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a research planner. Determine the optimal structure for knowledge nodes based on the query and documents. Be smart about how many nodes to create - not too few, not too many."},
                    {"role": "user", "content": plan_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.7
            )
            
            plan = self._parse_json_response(plan_response.choices[0].message.content)
            node_plans = plan.get("plan", [])
            
            # Cap at 8 nodes max for sanity
            node_plans = node_plans[:8]
            
            # Ensure at least 1 node
            if not node_plans:
                node_plans = [{"title": "Analysis", "focus": "Key insights from the documents", "color_hint": "blue"}]
            
            # Now generate each node individually and yield it
            for i, node_plan in enumerate(node_plans):
                node_prompt = f"""Query: {query}

Document Context:
{doc_content}

Create ONE detailed research node with this focus:
Title: {node_plan.get('title', f'Node {i+1}')}
Focus: {node_plan.get('focus', 'General insight')}
Suggested color: {node_plan.get('color_hint', 'blue')}

The node should have:
- A clear, specific title (can refine the suggested title)
- Concrete insights from the documents (optionally using markdown bullet points)
- A color: 'green' (positive/success), 'blue' (neutral/facts), 'yellow' (important/highlights), 'red' (risks/concerns/negatives)

Return JSON:
{{
  "node": {{
    "title": "Node Title",
    "content": "Point 1\nPoint 2\nPoint 3",
    "color": "green" | "blue" | "yellow" | "red"
  }}
}}"""

                node_response = await self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are a research assistant creating a single knowledge node. Extract specific, actionable insights."},
                        {"role": "user", "content": node_prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.7
                )
                
                result = self._parse_json_response(node_response.choices[0].message.content)
                node = result.get("node", {})
                
                if node:
                    yield {
                        "type": "node",
                        "data": node,
                        "index": i,
                        "total": len(node_plans)
                    }
                    
        except Exception as e:
            print(f"Stream graph error: {e}")
            yield {
                "type": "error",
                "data": {"message": str(e)}
            }

    async def generate_merge_suggestions(
        self,
        nodes: List[dict]
    ) -> dict:
        """
        Generate suggestions for merging multiple nodes.
        
        Args:
            nodes: List of nodes (dicts with title, content)
            
        Returns:
            Dict with 'suggestions' list
        """
        self._ensure_initialized()
        
        nodes_text = "\n---\n".join([
            f"Title: {n['title']}\nContent: {str(n['content'])[:500]}"
            for n in nodes
        ])
        
        system_prompt = """You are a research assistant that identifies connections between multiple knowledge nodes.
Suggest 3 distinct ways these nodes could be synthesized or merged.

Each suggestion should:
- Be a concise, action-oriented phrase (max 6 words)
- Focus on the thematic connection or relationship
- Be phrased as a goal or question (e.g., "Compare X and Y", "Synthesize findings on Z")

Always return valid JSON."""

        user_prompt = f"""Nodes to analyze:
{nodes_text}

Suggest 3 ways to synthesize these nodes into a single cohesive topic.

Return JSON format:
{{
  "suggestions": [
    "Suggestion 1",
    "Suggestion 2",
    "Suggestion 3"
  ]
}}"""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.8
            )
            
            content = response.choices[0].message.content
            return self._parse_json_response(content)
            
        except Exception as e:
            print(f"Merge suggestions error: {e}")
            return {
                "suggestions": [
                    "Synthesize findings from these nodes"
                ]
            }


    async def generate_expand_suggestions(
        self,
        node_title: str,
        node_content: str,
        documents: List[dict]
    ) -> dict:
        """
        Generate AI suggestions for how to expand a specific node.
        
        Args:
            node_title: Title of the node to expand
            node_content: Current content of the node
            documents: Document context
            
        Returns:
            Dict with 'suggestions' array of query strings (one-liners)
        """
        self._ensure_initialized()
        
        doc_content = "\n\n---\n\n".join([
            f"Document: {doc['name']}\nContent: {doc['content'][:6000]}"
            for doc in documents
        ]) if documents else "No documents provided."
        
        system_prompt = """You are a research assistant helping to expand knowledge nodes.
Given a node and document context, suggest 3 specific ONE-LINER ways to expand this node.
Each suggestion should be a clear, concise research directive or question (max 10 words)."""

        user_prompt = f"""Node to Expand:
Title: {node_title}
Content: {', '.join(node_content)}

Document Context:
{doc_content}

Generate 3 specific ONE-LINER suggestions for how this node could be expanded.
Focus on drilling deeper into specific aspects found in the documents.

Return JSON:
{{
  "suggestions": [
    "One-liner suggestion 1",
    "One-liner suggestion 2",
    "One-liner suggestion 3"
  ]
}}"""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.8
            )
            
            content = response.choices[0].message.content
            return self._parse_json_response(content)
            
        except Exception as e:
            print(f"Expand suggestions error: {e}")
            return {
                "suggestions": [
                    f"Explore sub-topics of '{node_title}'",
                    "Find related concepts in documents",
                    "Dive deeper into these specific findings"
                ]
            }


# Global service instance
openai_service = OpenAIService()

