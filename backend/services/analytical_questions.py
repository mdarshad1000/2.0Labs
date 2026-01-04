"""
Analytical Questions Service - Generates meaningful questions from matrix data.

This service analyzes the entire matrix context and generates analytical questions
that reveal insights, comparisons, trends, and anomalies worth visualizing.
"""
import json
import os
from typing import List, Dict, Optional
import statistics


# System prompt for generating analytical questions
QUESTION_GENERATOR_PROMPT = """You are an Analytical Question Generator for a financial research platform.

You analyze a matrix of data where:
- Rows = Entities (companies, documents, assets)
- Columns = Metrics (financial figures, ratios, qualitative data)
- Cells = Extracted values

Generate 3-5 analytical questions that reveal insights NOT obvious from scanning raw numbers.

QUESTION TYPES (pick the right visualization):
1. COMPARISON → "Which entity leads in X?" → Best for: LOLLIPOP chart
2. DELTA → "How do entities differ from average?" → Best for: DELTA_BAR chart  
3. TREND → "How does X change across entities?" → Best for: LINE chart
4. DISTRIBUTION → "How is X spread across entities?" → Best for: BAR chart

IMPORTANT: Only generate questions for metrics with NUMERIC values.
Skip metrics that contain text descriptions, dates, or qualitative data.

OUTPUT FORMAT (JSON):
{
  "questions": [
    {
      "id": "q1",
      "question": "Which entity has the highest Net Profit?",
      "intent": "COMPARISON",
      "metrics_involved": ["Net Profit (EUR)"],
      "entities_involved": ["all"],
      "visualization_hint": "LOLLIPOP"
    },
    {
      "id": "q2", 
      "question": "How do Total Assets vary from the group average?",
      "intent": "DELTA",
      "metrics_involved": ["Total Assets (EUR)"],
      "entities_involved": ["all"],
      "visualization_hint": "DELTA_BAR"
    }
  ]
}

RULES:
- Generate exactly 3-5 questions
- Only reference NUMERIC metrics (currency, percentages, counts)
- NEVER generate questions about text/qualitative metrics
- Each question should suggest one specific chart type
"""

# System prompt for answering questions with visualizations
QUESTION_ANSWERER_PROMPT = """You are a Visualization Data Generator. Your output feeds directly into a D3.js chart renderer.

CRITICAL REQUIREMENTS:
1. INCLUDE ALL ENTITIES - Do NOT skip any entity with numeric data
2. The "data" array MUST contain one entry for EACH entity in the matrix
3. Each entry: {"label": "string", "value": NUMBER, "highlight": boolean}
4. "value" MUST be a raw number (not string, not null)

=== CHART TYPES ===

1. LOLLIPOP - Ranked comparison
   Use for: "Which entity has highest/lowest X?"
   
2. DELTA_BAR - Deviation from average (REQUIRED for "differ from average" questions)
   Use for: "How do values differ from average?"
   MUST compute: value = entity_value - mean_of_all_values
   Result will have positive AND negative values
   
3. LINE - Trend over time/sequence
   Use for: "How does X change over time?"
   Order by time (2020, 2021, 2022, etc.)

4. BAR - Simple comparison
   Use for: Basic value comparison

=== COMPUTING DELTA FROM AVERAGE ===

When question asks about "differ from average" or "deviation":
1. First, extract all numeric values from the relevant metric column
2. Calculate the mean: mean = sum(all_values) / count
3. For EACH entity: delta = entity_value - mean
4. Use DELTA_BAR chart type

Example with 5 years of Net Profit data:
- 2020: 714,000,000
- 2021: 1,469,000,000
- 2022: 700,000,000
- 2023: 1,265,886
- 2024: 1,411,676,000

Mean = (714000000 + 1469000000 + 700000000 + 1265886 + 1411676000) / 5 = 859188377

Deltas:
- 2020: 714000000 - 859188377 = -145188377
- 2021: 1469000000 - 859188377 = 609811623
- 2022: 700000000 - 859188377 = -159188377
- 2023: 1265886 - 859188377 = -857922491
- 2024: 1411676000 - 859188377 = 552487623

Output for DELTA_BAR:
{"type": "DELTA_BAR", "data": [
  {"label": "2020", "value": -145188377, "highlight": false},
  {"label": "2021", "value": 609811623, "highlight": true},
  {"label": "2022", "value": -159188377, "highlight": false},
  {"label": "2023", "value": -857922491, "highlight": false},
  {"label": "2024", "value": 552487623, "highlight": false}
]}

=== PARSING VALUES FROM MATRIX ===

"714m" → 714000000
"1'469m" → 1469000000  
"700000000" → 700000000
"1,265,886" → 1265886
"1,411,676,000 EUR" → 1411676000
"€5.2M" → 5200000
"15.3%" → 15.3

=== OUTPUT FORMAT ===

{
  "answer_summary": "2021 shows highest deviation at +610M above average",
  "visualization": {
    "type": "DELTA_BAR",
    "title": "Net Profit Deviation",
    "y_axis": {"unit": "currency"},
    "data": [
      {"label": "2020", "value": -145188377, "highlight": false},
      {"label": "2021", "value": 609811623, "highlight": true},
      ...ALL OTHER ENTITIES...
    ],
    "insight": "2021 led with 610M above average"
  }
}

=== RULES ===

1. INCLUDE ALL ENTITIES - Never skip entities with numeric values
2. "value" must be a NUMBER: 5200000 ✓   "5.2M" ✗   null ✗
3. "label" should be short (year like "2020" or first 8 chars of name)
4. Set "highlight": true on the entity with largest absolute deviation
5. For DELTA_BAR: compute actual deltas (some positive, some negative)
6. Only skip entities with truly non-numeric values (text descriptions)
"""


class AnalyticalQuestionsService:
    """Service for generating and answering analytical questions from matrix data."""
    
    def __init__(self):
        self._llm_service = None
    
    def _get_llm_service(self):
        """Lazy import of LLM service."""
        if self._llm_service is None:
            from services.llm_service import llm_service
            self._llm_service = llm_service
        return self._llm_service
    
    def _parse_numeric_value(self, value: str) -> tuple:
        """Try to parse a numeric value from a cell string. Returns (number, is_numeric)."""
        if value is None or value == '—' or value == '':
            return None, False
            
        original = str(value)
        clean = original
        
        # Remove common currency and formatting
        for char in ['€', '$', '£', ',', ' ', '\n', '\t']:
            clean = clean.replace(char, '')
        
        # Handle suffixes
        multiplier = 1
        if clean.endswith('M') or clean.endswith('m'):
            multiplier = 1_000_000
            clean = clean[:-1]
        elif clean.endswith('K') or clean.endswith('k'):
            multiplier = 1_000
            clean = clean[:-1]
        elif clean.endswith('B') or clean.endswith('b'):
            multiplier = 1_000_000_000
            clean = clean[:-1]
        elif clean.endswith('%'):
            clean = clean[:-1]
        
        try:
            return float(clean) * multiplier, True
        except (ValueError, TypeError):
            return None, False
    
    def _get_entity_label(self, doc: Dict, metrics: List[Dict], cells: Dict[str, Dict]) -> str:
        """Get the best label for an entity - prefer Year if available, otherwise use doc name."""
        doc_id = doc.get('id', '')
        
        # Look for a Year column first
        for metric in metrics:
            metric_label = metric.get('label', '').lower()
            if 'year' in metric_label or metric_label in ['year', 'period', 'date']:
                cell_key = f"{doc_id}-{metric.get('id')}"
                cell = cells.get(cell_key, {})
                year_val = cell.get('value', '')
                if year_val and str(year_val).strip():
                    return str(year_val).strip()[:]
        
        # Fallback to document name (truncated)
        name = doc.get('name', doc_id)
        # If name is very long, try to extract a meaningful short version
        if len(name) > 12:
            # Try to find a year in the name
            import re
            year_match = re.search(r'20\d{2}', name)
            if year_match:
                return year_match.group()
        return name[:]
    
    def _build_matrix_context(
        self,
        documents: List[Dict],
        metrics: List[Dict],
        cells: Dict[str, Dict]
    ) -> str:
        """Build a textual representation of the matrix for the LLM."""
        lines = []
        lines.append("=== RAW MATRIX ===")
        lines.append("")
        
        # Header row
        header = ["Entity"] + [m.get('label', m.get('id', '')) for m in metrics]
        lines.append(" | ".join(header))
        lines.append("-" * (len(" | ".join(header))))
        
        # Data rows - collect entity labels for chart use
        entity_labels = []
        for doc in documents:
            entity_label = self._get_entity_label(doc, metrics, cells)
            entity_labels.append(entity_label)
            row = [doc.get('name', doc.get('id', ''))]
            for metric in metrics:
                cell_key = f"{doc.get('id')}-{metric.get('id')}"
                cell = cells.get(cell_key, {})
                value = cell.get('value', '—')
                if value is None:
                    value = '—'
                row.append(str(value)[:])  # Truncate long values
            lines.append(" | ".join(row))
        
        # Show entity labels for charting
        lines.append("")
        lines.append(f"=== CHART LABELS (use these as labels in chart) ===")
        lines.append(f"Entity labels (in order): {entity_labels}")
        
        # Also provide pre-parsed numeric data per metric
        lines.append("")
        lines.append("=== PARSED NUMERIC VALUES (use these for charts) ===")
        
        for metric in metrics:
            metric_label = metric.get('label', metric.get('id', ''))
            lines.append(f"\n{metric_label}:")
            
            values_with_entities = []
            for idx, doc in enumerate(documents):
                entity_label = entity_labels[idx]
                cell_key = f"{doc.get('id')}-{metric.get('id')}"
                cell = cells.get(cell_key, {})
                raw_value = cell.get('value', '')
                
                numeric_val, is_numeric = self._parse_numeric_value(raw_value)
                if is_numeric and numeric_val is not None:
                    values_with_entities.append((entity_label, numeric_val))
                    lines.append(f"  {entity_label}: {numeric_val}")
            
            # Add statistics if we have numeric values
            if values_with_entities:
                values = [v for _, v in values_with_entities]
                mean_val = sum(values) / len(values)
                lines.append(f"  [COUNT: {len(values)} entities]")
                lines.append(f"  [MEAN: {mean_val:.2f}]")
                
                # Show deltas from mean (useful for DELTA_BAR)
                lines.append(f"  [DELTAS FROM MEAN - use for DELTA_BAR chart:]")
                for entity, val in values_with_entities:
                    delta = val - mean_val
                    lines.append(f"    {entity}: {delta:+.2f}")
            else:
                lines.append("  (No numeric values - skip this metric)")
        
        lines.append("")
        lines.append(f"TOTAL ENTITIES: {len(documents)}")
        lines.append(f"METRICS: {[m.get('label', '') for m in metrics]}")
        
        return "\n".join(lines)
    
    async def generate_questions(
        self,
        documents: List[Dict],
        metrics: List[Dict],
        cells: Dict[str, Dict]
    ) -> List[Dict]:
        """
        Generate analytical questions based on the matrix data.
        
        Returns a list of question objects with id, question, intent, etc.
        """
        llm = self._get_llm_service()
        
        matrix_context = self._build_matrix_context(documents, metrics, cells)
        
        prompt = f"""{QUESTION_GENERATOR_PROMPT}

MATRIX CONTEXT:
{matrix_context}

Generate analytical questions for this matrix. Return valid JSON only."""

        try:
            # Use the underlying service directly for custom prompts
            service = llm._get_service()
            service._ensure_initialized()
            
            if hasattr(service, 'client'):
                # OpenAI
                response = await service.client.chat.completions.create(
                    model="gpt-4o-mini-mini",
                    messages=[
                        {"role": "system", "content": "You generate analytical questions. Return valid JSON only."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.7
                )
                content = response.choices[0].message.content
                data = service._parse_json_response(content)
            else:
                # Gemini
                import google.generativeai as genai
                response = await service.flash_model.generate_content_async(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        response_mime_type="application/json",
                        temperature=0.7
                    )
                )
                data = service._parse_json_response(response.text)
            
            questions = data.get('questions', [])
            print(f"[AnalyticalQuestions] Generated {len(questions)} questions")
            return questions
            
        except Exception as e:
            print(f"[AnalyticalQuestions] Error generating questions: {e}")
            # Return fallback questions
            return self._generate_fallback_questions(metrics)
    
    def _generate_fallback_questions(self, metrics: List[Dict]) -> List[Dict]:
        """Generate basic fallback questions when LLM fails."""
        questions = []
        metric_labels = [m.get('label', '') for m in metrics[:]]
        
        if len(metric_labels) >= 1:
            questions.append({
                "id": "q1",
                "question": f"Which entity leads in {metric_labels[0]}?",
                "intent": "COMPARISON",
                "metrics_involved": [metric_labels[0]],
                "entities_involved": ["all"],
                "visualization_hint": "LOLLIPOP"
            })
        
        if len(metric_labels) >= 1:
            questions.append({
                "id": "q2",
                "question": f"How do entities differ from average {metric_labels[0]}?",
                "intent": "DELTA",
                "metrics_involved": [metric_labels[0]],
                "entities_involved": ["all"],
                "visualization_hint": "DELTA_BAR"
            })
        
        if len(metric_labels) >= 2:
            questions.append({
                "id": "q3",
                "question": f"Compare {metric_labels[0]} across all entities",
                "intent": "COMPARISON",
                "metrics_involved": [metric_labels[0], metric_labels[1]],
                "entities_involved": ["all"],
                "visualization_hint": "BAR"
            })
        
        return questions
    
    def _extract_metric_values_from_cells(
        self,
        documents: List[Dict],
        metrics: List[Dict],
        cells: Dict[str, Dict],
        metric_labels: List[str]
    ) -> Dict[str, Dict[str, float]]:
        """
        Extract numeric values for specified metrics from the cells.
        Returns: {entity_label: {metric_label: value}}
        """
        result = {}
        
        # Find metric IDs for the requested labels
        metric_ids_map = {}
        for metric in metrics:
            label = metric.get('label', '')
            for requested_label in metric_labels:
                if requested_label.lower() in label.lower() or label.lower() in requested_label.lower():
                    metric_ids_map[metric.get('id')] = label
                    break
        
        for doc in documents:
            doc_id = doc.get('id', '')
            entity_label = self._get_entity_short_name(doc, documents, cells)
            
            if entity_label not in result:
                result[entity_label] = {}
            
            for metric_id, metric_label in metric_ids_map.items():
                cell_key = f"{doc_id}_{metric_id}"
                cell = cells.get(cell_key, {})
                cell_value = cell.get('value', '')
                
                parsed_value, is_numeric = self._parse_numeric_value(cell_value)
                if is_numeric and parsed_value is not None:
                    result[entity_label][metric_label] = parsed_value
        
        return result
    
    def _validate_and_fix_visualization(
        self, 
        data: Dict,
        expected_entities: Optional[List[str]] = None,
        entity_values: Optional[Dict[str, float]] = None,
        chart_type_hint: str = 'BAR'
    ) -> Dict:
        """Validate and fix common LLM output issues, filling in missing entities."""
        if not data.get('visualization'):
            return data
            
        viz = data['visualization']
        
        # Ensure data array exists
        if not viz.get('data') or not isinstance(viz['data'], list):
            print("[AnalyticalQuestions] Missing or invalid data array")
            return {"answer_summary": "No data available", "visualization": None}
        
        # Filter and fix data points
        fixed_data = []
        seen_labels = set()
        
        for point in viz['data']:
            if not isinstance(point, dict):
                continue
                
            label = point.get('label', '')
            value = point.get('value')
            
            # Convert string values to numbers
            if isinstance(value, str):
                # Try to parse numeric strings
                try:
                    # Remove currency symbols and commas
                    clean = value.replace('€', '').replace('$', '').replace(',', '').replace(' ', '')
                    # Handle M/K/B suffixes
                    if clean.endswith('M'):
                        value = float(clean[:-1]) * 1_000_000
                    elif clean.endswith('K'):
                        value = float(clean[:-1]) * 1_000
                    elif clean.endswith('B'):
                        value = float(clean[:-1]) * 1_000_000_000
                    elif clean.endswith('%'):
                        value = float(clean[:-1])
                    else:
                        value = float(clean)
                except (ValueError, TypeError):
                    print(f"[AnalyticalQuestions] Skipping non-numeric value: {value}")
                    continue
            
            # Skip null/None values
            if value is None:
                continue
                
            # Ensure value is numeric
            if not isinstance(value, (int, float)):
                continue
                
            # Clean label
            label = str(label).strip() if label else "Unknown"
            
            fixed_data.append({
                "label": label,
                "value": float(value),
                "highlight": bool(point.get('highlight', False))
            })
            seen_labels.add(label)
        
        # Fill in missing entities if we have expected entities and their values
        if expected_entities and entity_values:
            for entity in expected_entities:
                # Check if this entity is missing (by checking common variations)
                entity_found = False
                for seen in seen_labels:
                    if entity in seen or seen in entity:
                        entity_found = True
                        break
                
                if not entity_found and entity in entity_values:
                    value = entity_values[entity]
                    print(f"[AnalyticalQuestions] Adding missing entity: {entity} = {value}")
                    fixed_data.append({
                        "label": entity,
                        "value": float(value),
                        "highlight": False
                    })
                    seen_labels.add(entity)
        
        if not fixed_data:
            print("[AnalyticalQuestions] No valid data points after filtering")
            return {"answer_summary": "No numeric data available", "visualization": None}
        
        # Sort by label if they look like years
        try:
            if all(d['label'].isdigit() for d in fixed_data):
                fixed_data.sort(key=lambda d: int(d['label']))
        except:
            pass
        
        # Ensure at least one highlight
        if not any(d['highlight'] for d in fixed_data):
            # Highlight the max absolute value
            max_idx = max(range(len(fixed_data)), key=lambda i: abs(fixed_data[i]['value']))
            fixed_data[max_idx]['highlight'] = True
        
        # For DELTA_BAR: ensure we have both positive and negative values
        chart_type = viz.get('type', chart_type_hint).upper()
        if chart_type == 'DELTA_BAR' or 'DELTA' in chart_type:
            has_positive = any(d['value'] > 0 for d in fixed_data)
            has_negative = any(d['value'] < 0 for d in fixed_data)
            
            if not (has_positive and has_negative):
                # Convert to deltas from mean
                values = [d['value'] for d in fixed_data]
                mean = sum(values) / len(values)
                for d in fixed_data:
                    d['value'] = d['value'] - mean
                # Re-calculate highlight after conversion
                max_idx = max(range(len(fixed_data)), key=lambda i: abs(fixed_data[i]['value']))
                for i, d in enumerate(fixed_data):
                    d['highlight'] = (i == max_idx)
                print(f"[AnalyticalQuestions] Converted to deltas from mean: {mean:.2f}")
        
        viz['data'] = fixed_data
        viz['type'] = chart_type
        data['visualization'] = viz
        
        print(f"[AnalyticalQuestions] Validated {len(fixed_data)} data points for {chart_type} chart")
        return data

    async def answer_question(
        self,
        question: Dict,
        documents: List[Dict],
        metrics: List[Dict],
        cells: Dict[str, Dict]
    ) -> Dict:
        """
        Generate a visualization answer for a specific question.
        
        Returns the visualization spec and answer summary.
        """
        llm = self._get_llm_service()
        
        matrix_context = self._build_matrix_context(documents, metrics, cells)
        
        # Extract expected entity labels and their values for the involved metrics
        expected_entities = [self._get_entity_short_name(doc, documents, cells) for doc in documents]
        metrics_involved = question.get('metrics_involved', [])
        entity_metric_values = self._extract_metric_values_from_cells(
            documents, metrics, cells, metrics_involved
        )
        
        # Get the first metric's values for filling in missing entities
        first_metric_values = {}
        for entity, metric_vals in entity_metric_values.items():
            for metric_label, value in metric_vals.items():
                first_metric_values[entity] = value
                break  # Just take the first metric
        
        print(f"[AnalyticalQuestions] Expected entities: {expected_entities}")
        print(f"[AnalyticalQuestions] Entity values: {first_metric_values}")
        
        # Build a more explicit prompt with example output
        entity_list_str = ", ".join(expected_entities)
        prompt = f"""{QUESTION_ANSWERER_PROMPT}

=== YOUR TASK ===

QUESTION: {question.get('question', '')}
INTENT: {question.get('intent', 'COMPARISON')}
METRICS INVOLVED: {question.get('metrics_involved', [])}

MATRIX DATA:
{matrix_context}

EXPECTED ENTITIES (YOU MUST INCLUDE ALL OF THESE): {entity_list_str}

CRITICAL INSTRUCTIONS:
1. You MUST include ALL {len(expected_entities)} entities: {entity_list_str}
2. Extract numeric values for each entity from the relevant metric column
3. If question asks about "differ from average" or "deviation":
   - Calculate mean = sum(all_values) / count
   - For each entity: delta = entity_value - mean
   - Use DELTA_BAR chart type
4. Parse values correctly: "714m" = 714000000, "1'469m" = 1469000000
5. Return valid JSON with RAW NUMBERS only (not strings)
6. DO NOT SKIP ANY ENTITY - include data for all {len(expected_entities)} entities

Return valid JSON:"""

        try:
            service = llm._get_service()
            service._ensure_initialized()
            
            if hasattr(service, 'client'):
                # OpenAI
                response = await service.client.chat.completions.create(
                    model="gpt-4o-mini-mini",
                    messages=[
                        {"role": "system", "content": "You generate chart data. Return ONLY valid JSON with numeric values."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2  # Lower temperature for more consistent output
                )
                content = response.choices[0].message.content
                data = service._parse_json_response(content)
            else:
                # Gemini
                import google.generativeai as genai
                response = await service.flash_model.generate_content_async(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        response_mime_type="application/json",
                        temperature=0.2
                    )
                )
                data = service._parse_json_response(response.text)
            
            # Log raw LLM response for debugging
            print(f"[AnalyticalQuestions] Raw LLM response data points: {len(data.get('visualization', {}).get('data', []))} items")
            if data.get('visualization', {}).get('data'):
                for dp in data['visualization']['data']:
                    print(f"  - {dp.get('label')}: {dp.get('value')}")
            
            # Validate and fix the output, filling in missing entities
            chart_type_hint = question.get('visualization_hint', 'BAR')
            data = self._validate_and_fix_visualization(
                data,
                expected_entities=expected_entities,
                entity_values=first_metric_values,
                chart_type_hint=chart_type_hint
            )
            
            print(f"[AnalyticalQuestions] Final visualization for: {question.get('question', '')[:50]}...")
            if data.get('visualization', {}).get('data'):
                print(f"[AnalyticalQuestions] Final data points: {len(data['visualization']['data'])}")
                for dp in data['visualization']['data']:
                    print(f"  - {dp.get('label')}: {dp.get('value')}")
            return data
            
        except Exception as e:
            print(f"[AnalyticalQuestions] Error answering question: {e}")
            import traceback
            traceback.print_exc()
            return {
                "answer_summary": "Unable to generate visualization",
                "visualization": None,
                "error": str(e)
            }


# Global service instance
analytical_questions_service = AnalyticalQuestionsService()

