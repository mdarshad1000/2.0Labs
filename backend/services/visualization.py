"""
Column visualization analysis service with LLM-driven analytical intent resolution.

Analyzes numeric columns to determine:
1. Analytical intent (trend, distribution, comparison, relationship, composition)
2. Appropriate chart type based on intent
3. Whether the chart reveals information not visible in the matrix
4. Insight annotations explaining what the chart reveals

Now powered by LLM Chart Orchestrator with fallback to rule-based logic.
"""
import re
import asyncio
import hashlib
import time
from typing import List, Dict, Optional, Tuple
from collections import Counter
import statistics

from core.config import settings
from core.logfire_config import logger

from pydantic import ValidationError

from models.visualization import (
    LLMChartSpec,
    LLM_TO_FRONTEND_CHART_TYPE,
    LLM_TO_FRONTEND_INTENT,
)
from core.logfire_config import log_error, log_info, log_warning, log_debug


class AnalyticalIntent:
    """Enum-like class for analytical intents."""
    TREND = "trend"           # Time-indexed patterns
    DISTRIBUTION = "distribution"  # How values spread
    COMPARISON = "comparison"      # Cross-entity comparison
    DELTA = "delta"               # Change / before-after
    RELATIONSHIP = "relationship" # Correlation between metrics
    COMPOSITION = "composition"   # Part-of-whole


class ChartType:
    """Chart types mapped to intents."""
    LINE = "line"
    AREA = "area"
    HISTOGRAM = "histogram"
    BOXPLOT = "boxplot"
    SCATTER = "scatter"
    SLOPE = "slope"
    DELTA_BAR = "delta_bar"
    LOLLIPOP = "lollipop"


class ChartSpecCache:
    """Simple TTL cache for LLM chart specifications."""
    
    def __init__(self, ttl_seconds: int = 300):
        self._cache: Dict[str, Tuple[dict, float]] = {}
        self._ttl = ttl_seconds
    
    def _make_key(self, metric_label: str, values: List[float]) -> str:
        """Create a unique cache key from metric label and values."""
        # Sort values for consistent hashing
        values_str = str(sorted(values))
        combined = f"{metric_label}:{values_str}"
        return hashlib.sha256(combined.encode()).hexdigest()[:16]
    
    def get(self, metric_label: str, values: List[float]) -> Optional[dict]:
        """Get cached spec if exists and not expired."""
        key = self._make_key(metric_label, values)
        if key in self._cache:
            spec, timestamp = self._cache[key]
            if time.time() - timestamp < self._ttl:
                return spec
            else:
                # Expired, remove it
                del self._cache[key]
        return None
    
    def set(self, metric_label: str, values: List[float], spec: dict) -> None:
        """Cache a chart spec."""
        key = self._make_key(metric_label, values)
        self._cache[key] = (spec, time.time())
    
    def clear(self) -> None:
        """Clear all cached specs."""
        self._cache.clear()


class VisualizationService:
    """Service for analyzing column data with LLM-driven chart selection."""
    
    # Patterns for detecting numeric types
    PERCENTAGE_PATTERN = re.compile(r'^[\d,]+\.?\d*\s*%$', re.IGNORECASE)
    CURRENCY_PATTERNS = [
        re.compile(r'^\$[\d,]+\.?\d*[kmb]?$', re.IGNORECASE),
        re.compile(r'^[\d,]+\.?\d*[kmb]?\s*\$', re.IGNORECASE),
        re.compile(r'^USD\s*[\d,]+\.?\d*', re.IGNORECASE),
        re.compile(r'^EUR\s*[\d,]+\.?\d*', re.IGNORECASE),
    ]
    MULTIPLE_PATTERN = re.compile(r'^[\d,]+\.?\d*\s*x$', re.IGNORECASE)
    
    # Time-related keywords in metric labels
    TIME_KEYWORDS = [
        'growth', 'yoy', 'y/y', 'qoq', 'q/q', 'mom', 'm/m',
        'annual', 'quarterly', 'monthly', 'yearly',
        'trend', 'change', 'delta', 'increase', 'decrease',
        'over time', 'historical', 'forecast', 'projection'
    ]
    
    # Comparison keywords
    COMPARISON_KEYWORDS = [
        'vs', 'versus', 'compared', 'relative', 'benchmark',
        'peer', 'competitor', 'industry', 'average', 'median'
    ]
    
    # Composition keywords
    COMPOSITION_KEYWORDS = [
        'breakdown', 'composition', 'mix', 'allocation',
        'segment', 'share', 'portion', 'split'
    ]
    
    def __init__(self):
        # LLM service will be lazily imported to avoid circular imports
        self._llm_service = None
        
        # Cache for LLM responses
        cache_ttl = settings.chart.llm_cache_ttl
        self._cache = ChartSpecCache(ttl_seconds=cache_ttl)
        
        # LLM timeout
        self._llm_timeout = settings.chart.llm_timeout
        
        # Whether to use LLM orchestration (can be disabled via env)
        self._use_llm = settings.chart.use_llm
        
        logger.info(f"[VisualizationService] Initialized: use_llm={self._use_llm}, timeout={self._llm_timeout}s, cache_ttl={cache_ttl}s")
    
    def _get_llm_service(self):
        """Lazy import of LLM service to avoid circular imports."""
        if self._llm_service is None:
            from services.llm_service import llm_service
            self._llm_service = llm_service
        return self._llm_service
    
    def parse_numeric_value(self, value_str: str) -> Optional[Tuple[float, Optional[str]]]:
        """Parse a numeric value from a string."""
        if not value_str or value_str == "—" or value_str == "Fault":
            return None
        
        cleaned = value_str.strip()
        
        # Check for percentage
        if self.PERCENTAGE_PATTERN.match(cleaned):
            num_str = cleaned.replace('%', '').replace(',', '').strip()
            try:
                return (float(num_str), 'percentage')
            except ValueError:
                return None
        
        # Check for currency
        for pattern in self.CURRENCY_PATTERNS:
            if pattern.match(cleaned):
                num_str = re.sub(r'[^\d.,]', '', cleaned)
                num_str = num_str.replace(',', '')
                
                multiplier = 1.0
                if 'k' in cleaned.lower():
                    multiplier = 1000
                elif 'm' in cleaned.lower():
                    multiplier = 1000000
                elif 'b' in cleaned.lower():
                    multiplier = 1000000000
                
                try:
                    value = float(num_str) * multiplier
                    return (value, 'currency')
                except ValueError:
                    return None
        
        # Check for multiple (e.g., 2.5x)
        if self.MULTIPLE_PATTERN.match(cleaned):
            num_str = cleaned.replace('x', '').replace(',', '').strip()
            try:
                return (float(num_str), 'multiple')
            except ValueError:
                return None
        
        # Try plain numeric
        num_str = re.sub(r'[^\d.,\-+]', '', cleaned)
        num_str = num_str.replace(',', '')
        
        try:
            value = float(num_str)
            if num_str:
                return (value, 'numeric')
        except ValueError:
            pass
        
        return None
    
    def _compute_variance_stats(self, values: List[float]) -> dict:
        """Compute variance statistics for the LLM."""
        if len(values) < 2:
            return {"mean": values[0] if values else 0, "stdev": 0, "cv": 0}
        
        try:
            mean = statistics.mean(values)
            stdev = statistics.stdev(values)
            cv = stdev / mean if mean != 0 else 0
            return {
                "mean": round(mean, 4),
                "stdev": round(stdev, 4),
                "cv": round(cv, 4),
                "min": round(min(values), 4),
                "max": round(max(values), 4),
                "range": round(max(values) - min(values), 4)
            }
        except Exception:
            return {"mean": 0, "stdev": 0, "cv": 0}
    
    async def generate_chart_spec_llm(
        self,
        metric_label: str,
        values: List[float],
        unit_type: Optional[str],
        related_columns: Optional[List[str]] = None
    ) -> Optional[dict]:
        """
        Generate chart spec using the LLM Chart Orchestrator.
        
        Returns None if LLM call fails or times out (fallback will be used).
        """
        # Check cache first
        cached = self._cache.get(metric_label, values)
        if cached is not None:
            log_debug("Chart orchestrator cache hit", metric_label=metric_label)
            return cached
        
        try:
            llm_service = self._get_llm_service()
            
            # Compute variance stats
            variance_stats = self._compute_variance_stats(values)
            
            # Call LLM with timeout
            raw_response = await asyncio.wait_for(
                llm_service.generate_chart_spec(
                    metric_label=metric_label,
                    unit=unit_type,
                    values=values,
                    time_index=None,  # Could be enhanced to detect time indices
                    variance_stats=variance_stats,
                    matrix_visible=True,
                    chart_requested=False,
                    related_columns=related_columns
                ),
                timeout=self._llm_timeout
            )
            
            # Validate response with Pydantic
            validated_spec = LLMChartSpec(**raw_response)
            
            # Cache the validated response
            self._cache.set(metric_label, values, raw_response)
            
            log_info(
                "Chart orchestrator LLM decision",
                metric_label=metric_label,
                should_render=validated_spec.should_render,
                intent=validated_spec.intent,
                chart_type=validated_spec.chart_type
            )
            
            return raw_response
            
        except asyncio.TimeoutError:
            log_warning("Chart orchestrator LLM timeout - using fallback", metric_label=metric_label)
            return None
        except ValidationError as e:
            log_warning("Chart orchestrator validation error", metric_label=metric_label, error=str(e))
            return None
        except Exception as e:
            log_error("Chart orchestrator LLM error", error=e, metric_label=metric_label)
            return None
    
    # ========== FALLBACK RULE-BASED METHODS ==========
    
    def resolve_intent(
        self,
        metric_label: str,
        values: List[float],
        unit_type: Optional[str],
        all_metrics: List[Dict],
        all_values_by_metric: Dict[str, List[float]]
    ) -> Tuple[str, float]:
        """
        Resolve the analytical intent for a column (rule-based fallback).
        
        Returns:
            Tuple of (intent, confidence_score 0-1)
        """
        label_lower = metric_label.lower()
        
        # Check for time-related intent
        time_score = sum(1 for kw in self.TIME_KEYWORDS if kw in label_lower)
        if time_score > 0:
            return (AnalyticalIntent.TREND, min(0.6 + time_score * 0.1, 0.95))
        
        # Check for composition intent
        composition_score = sum(1 for kw in self.COMPOSITION_KEYWORDS if kw in label_lower)
        if composition_score > 0 and unit_type == 'percentage':
            return (AnalyticalIntent.COMPOSITION, min(0.5 + composition_score * 0.15, 0.9))
        
        # Check for comparison intent
        comparison_score = sum(1 for kw in self.COMPARISON_KEYWORDS if kw in label_lower)
        if comparison_score > 0:
            return (AnalyticalIntent.COMPARISON, min(0.5 + comparison_score * 0.15, 0.9))
        
        # Check for delta/change intent
        if any(kw in label_lower for kw in ['change', 'delta', 'difference', 'gain', 'loss']):
            return (AnalyticalIntent.DELTA, 0.75)
        
        # Check for relationship - if another numeric column exists with similar cardinality
        other_numeric_columns = [
            (k, v) for k, v in all_values_by_metric.items() 
            if k != metric_label and len(v) >= 3
        ]
        if other_numeric_columns:
            # Could be a relationship analysis candidate
            return (AnalyticalIntent.RELATIONSHIP, 0.4)
        
        # Default to distribution for numeric data
        if len(values) >= 5:
            return (AnalyticalIntent.DISTRIBUTION, 0.7)
        
        return (AnalyticalIntent.COMPARISON, 0.5)
    
    def select_chart_type(
        self,
        intent: str,
        values: List[float],
        unit_type: Optional[str]
    ) -> Optional[str]:
        """Select the appropriate chart type based on intent (rule-based fallback)."""
        
        if intent == AnalyticalIntent.TREND:
            # Time-indexed → line or area (never bar)
            if unit_type == 'percentage':
                return ChartType.AREA
            return ChartType.LINE
        
        elif intent == AnalyticalIntent.DISTRIBUTION:
            # Cross-entity numeric → histogram or boxplot
            if len(values) >= 5:
                sorted_values = sorted(values)
                q1_idx = len(sorted_values) // 4
                q3_idx = (3 * len(sorted_values)) // 4
                q1 = sorted_values[q1_idx]
                q3 = sorted_values[q3_idx]
                iqr = q3 - q1
                
                if iqr > 0:
                    lower_bound = q1 - 1.5 * iqr
                    upper_bound = q3 + 1.5 * iqr
                    has_outliers = any(v < lower_bound or v > upper_bound for v in sorted_values)
                    if has_outliers:
                        return ChartType.BOXPLOT
            return ChartType.HISTOGRAM
        
        elif intent == AnalyticalIntent.COMPARISON:
            # Comparison → lollipop (cleaner than bar)
            return ChartType.LOLLIPOP
        
        elif intent == AnalyticalIntent.DELTA:
            # Before/after → delta bar or slope
            return ChartType.DELTA_BAR
        
        elif intent == AnalyticalIntent.RELATIONSHIP:
            # Paired metrics → scatter
            return ChartType.SCATTER
        
        elif intent == AnalyticalIntent.COMPOSITION:
            # Part-of-whole → could be stacked, but we'll use histogram for now
            return ChartType.HISTOGRAM
        
        return ChartType.HISTOGRAM
    
    def reveals_new_information(
        self,
        intent: str,
        values: List[float],
        cardinality: int
    ) -> Tuple[bool, str]:
        """
        Determine if a chart would reveal information not visible in the matrix.
        
        Returns:
            Tuple of (should_render, reason)
        
        Note: This is now very permissive - almost always returns True.
        """
        # Very loose threshold - show chart for 2+ values
        if cardinality < 2:
            return (False, "Need at least 2 data points")
        
        # Default to showing charts - let the user decide if useful
        if intent == AnalyticalIntent.TREND:
            return (True, "Time-based patterns benefit from visualization")
        
        elif intent == AnalyticalIntent.DELTA:
            return (True, "Change visualization clarifies direction and magnitude")
        
        elif intent == AnalyticalIntent.RELATIONSHIP:
            return (True, "Relationship patterns not visible in tabular form")
        
        elif intent == AnalyticalIntent.DISTRIBUTION:
            return (True, "Distribution visualization shows spread")
        
        elif intent == AnalyticalIntent.COMPARISON:
            return (True, "Comparison chart highlights differences")
        
        elif intent == AnalyticalIntent.COMPOSITION:
            return (True, "Composition chart shows proportions")
        
        return (True, "Chart provides visual context")
    
    def generate_insight(
        self,
        intent: str,
        values: List[float],
        unit_type: Optional[str],
        metric_label: str
    ) -> Optional[str]:
        """Generate a single, muted insight annotation for the chart (rule-based fallback)."""
        
        if not values or len(values) < 2:
            return None
        
        try:
            mean = statistics.mean(values)
            median = statistics.median(values)
            min_val = min(values)
            max_val = max(values)
            
            # Format value based on unit type
            def fmt(v: float) -> str:
                if unit_type == 'percentage':
                    return f"{v:.1f}%"
                elif unit_type == 'currency':
                    if v >= 1000000:
                        return f"${v/1000000:.1f}M"
                    elif v >= 1000:
                        return f"${v/1000:.0f}K"
                    return f"${v:.0f}"
                elif unit_type == 'multiple':
                    return f"{v:.1f}x"
                else:
                    if abs(v) >= 1000:
                        return f"{v/1000:.1f}K"
                    return f"{v:.1f}"
            
            if intent == AnalyticalIntent.DISTRIBUTION:
                # Insight about spread
                if len(values) >= 3:
                    stdev = statistics.stdev(values)
                    cv = (stdev / mean) * 100 if mean != 0 else 0
                    if cv > 50:
                        return f"High variance — {fmt(min_val)} to {fmt(max_val)}"
                    elif abs(mean - median) / mean > 0.15 if mean != 0 else False:
                        return f"Skewed distribution — median {fmt(median)} vs mean {fmt(mean)}"
                    else:
                        return f"Centered around {fmt(median)}"
            
            elif intent == AnalyticalIntent.COMPARISON:
                # Insight about relative position
                spread = max_val - min_val
                if spread / mean > 0.5 if mean != 0 else False:
                    return f"Wide spread — {fmt(min_val)} to {fmt(max_val)}"
                return f"Range: {fmt(min_val)} – {fmt(max_val)}"
            
            elif intent == AnalyticalIntent.DELTA:
                # Could calculate actual delta if we had paired data
                return f"Values range from {fmt(min_val)} to {fmt(max_val)}"
            
            elif intent == AnalyticalIntent.TREND:
                # Simple trend indication (would need time ordering)
                return f"Range: {fmt(min_val)} to {fmt(max_val)}"
            
        except Exception:
            pass
        
        return None
    
    def _fallback_analyze_column(
        self,
        metric_label: str,
        parsed_values: List[float],
        most_common_unit: Optional[str],
        all_metrics: List[Dict],
        all_values_by_metric: Dict[str, List[float]],
        value_doc_map: List[int],
        cardinality: int,
        units_consistent: bool
    ) -> Dict:
        """Rule-based fallback analysis when LLM is unavailable."""
        
        # Resolve analytical intent
        intent, intent_confidence = self.resolve_intent(
            metric_label,
            parsed_values,
            most_common_unit,
            all_metrics,
            all_values_by_metric
        )
        
        # Select chart type based on intent
        chart_type = self.select_chart_type(intent, parsed_values, most_common_unit)
        
        # Determine if chart reveals new information
        reveals_info, info_reason = self.reveals_new_information(
            intent, parsed_values, cardinality
        )
        
        # Generate insight annotation
        insight = self.generate_insight(
            intent, parsed_values, most_common_unit, metric_label
        )
        
        # Final visualizable decision (loose thresholds)
        # Only require 2+ values and a detected unit type
        visualizable = (
            cardinality >= 2 and
            most_common_unit is not None
        )
        
        # Debug logging
        print(f"[Fallback] '{metric_label}': visualizable={visualizable} "
              f"(cardinality={cardinality}>=2? {cardinality >= 2}, "
              f"unit={most_common_unit})")
        
        return {
            'visualizable': visualizable,
            'data_type': most_common_unit,
            'cardinality': cardinality,
            'values': parsed_values,
            'value_doc_indices': value_doc_map,
            'unit_type': most_common_unit,
            'chart_type': chart_type,
            'intent': intent,
            'intent_confidence': intent_confidence,
            'reveals_info': reveals_info,
            'info_reason': info_reason,
            'insight': insight,
            'llm_powered': False
        }
    
    def _llm_spec_to_response(
        self,
        llm_spec: dict,
        parsed_values: List[float],
        most_common_unit: Optional[str],
        value_doc_map: List[int],
        cardinality: int,
        units_consistent: bool
    ) -> Dict:
        """Convert LLM chart spec to the frontend-compatible response format."""
        
        should_render = llm_spec.get('should_render', False)
        
        if not should_render:
            return {
                'visualizable': False,
                'data_type': most_common_unit,
                'cardinality': cardinality,
                'values': parsed_values,
                'value_doc_indices': value_doc_map,
                'unit_type': most_common_unit,
                'chart_type': None,
                'intent': None,
                'intent_confidence': 0.0,
                'reveals_info': False,
                'info_reason': llm_spec.get('reason', 'Matrix already communicates this information clearly'),
                'insight': None,
                'llm_powered': True
            }
        
        # Map LLM types to frontend types
        llm_intent = llm_spec.get('intent', 'DISTRIBUTION')
        llm_chart_type = llm_spec.get('chart_type', 'HISTOGRAM')
        
        frontend_intent = LLM_TO_FRONTEND_INTENT.get(llm_intent, 'distribution')
        frontend_chart_type = LLM_TO_FRONTEND_CHART_TYPE.get(llm_chart_type, 'histogram')
        
        # Final visualizable decision (loose thresholds)
        visualizable = (
            cardinality >= 2 and
            most_common_unit is not None
        )
        
        return {
            'visualizable': visualizable,
            'data_type': most_common_unit,
            'cardinality': cardinality,
            'values': parsed_values,
            'value_doc_indices': value_doc_map,
            'unit_type': most_common_unit,
            'chart_type': frontend_chart_type,
            'intent': frontend_intent,
            'intent_confidence': 0.95,  # High confidence when LLM decides
            'reveals_info': True,
            'info_reason': llm_spec.get('primary_question', 'LLM-determined visualization'),
            'insight': llm_spec.get('insight'),
            'llm_powered': True
        }
    
    async def analyze_column_async(
        self,
        metric_id: str,
        metric_label: str,
        cells: Dict[str, Dict],
        all_metrics: List[Dict],
        all_values_by_metric: Dict[str, List[float]]
    ) -> Dict:
        """
        Analyze a column with LLM-driven chart selection (async).
        
        Falls back to rule-based logic if LLM fails.
        """
        # Collect all cells for this metric
        metric_cells = []
        doc_ids = []
        for cell_key, cell_data in cells.items():
            if f"-{metric_id}" in cell_key:
                value = cell_data.get('value')
                if value:
                    metric_cells.append(value)
                    doc_id = cell_key.split(f"-{metric_id}")[0]
                    doc_ids.append(doc_id)
        
        # Parse numeric values
        parsed_values = []
        unit_types = []
        value_doc_map = []  # Map values to doc indices
        
        for idx, value_str in enumerate(metric_cells):
            parsed = self.parse_numeric_value(value_str)
            if parsed:
                value, unit_type = parsed
                parsed_values.append(value)
                unit_types.append(unit_type)
                value_doc_map.append(idx)
        
        # Determine unit type
        unit_type_counter = Counter(unit_types)
        most_common_unit = unit_type_counter.most_common(1)[0][0] if unit_types else None
        
        cardinality = len(parsed_values)
        units_consistent = len(set(unit_types)) <= 1 if unit_types else False
        
        # Early return only if truly no data (very loose threshold)
        if cardinality < 2 or most_common_unit is None:
            print(f"[EarlyReturn] '{metric_label}': cardinality={cardinality}, unit={most_common_unit}")
            print(f"[EarlyReturn] Raw cells: {metric_cells[:5]}...")  # Show first 5
            return self._fallback_analyze_column(
                metric_label, parsed_values, most_common_unit,
                all_metrics, all_values_by_metric,
                value_doc_map, cardinality, units_consistent
            )
        
        # Try LLM orchestration if enabled
        if self._use_llm:
            print(f"[LLM] Attempting chart orchestration for '{metric_label}' ({cardinality} values)")
            related_columns = [
                m.get('label', '') for m in all_metrics 
                if m.get('label', '') != metric_label
            ]
            
            llm_spec = await self.generate_chart_spec_llm(
                metric_label=metric_label,
                values=parsed_values,
                unit_type=most_common_unit,
                related_columns=related_columns
            )
            
            if llm_spec is not None:
                print(f"[LLM] Got spec for '{metric_label}': should_render={llm_spec.get('should_render')}, intent={llm_spec.get('intent')}")
                
                # If LLM says show chart, use its spec
                if llm_spec.get('should_render', False):
                    return self._llm_spec_to_response(
                        llm_spec, parsed_values, most_common_unit,
                        value_doc_map, cardinality, units_consistent
                    )
                else:
                    # LLM said no chart, but we want to be permissive
                    # Fall through to rule-based logic which will show the chart
                    print(f"[LLM] Overriding LLM decision for '{metric_label}' - using rule-based (more permissive)")
            else:
                print(f"[LLM] No spec returned for '{metric_label}', falling back to rules")
        else:
            print(f"[LLM] Disabled, using rule-based for '{metric_label}'")
        
        # Fallback to rule-based analysis
        return self._fallback_analyze_column(
            metric_label, parsed_values, most_common_unit,
            all_metrics, all_values_by_metric,
            value_doc_map, cardinality, units_consistent
        )
    
    def analyze_column(
        self,
        metric_id: str,
        metric_label: str,
        cells: Dict[str, Dict],
        all_metrics: List[Dict],
        all_values_by_metric: Dict[str, List[float]]
    ) -> Dict:
        """
        Analyze a column with intent-driven chart selection (sync wrapper).
        
        This is a synchronous wrapper for backward compatibility.
        Uses rule-based logic only (no LLM) in sync context.
        """
        # Collect all cells for this metric
        metric_cells = []
        doc_ids = []
        for cell_key, cell_data in cells.items():
            if f"-{metric_id}" in cell_key:
                value = cell_data.get('value')
                if value:
                    metric_cells.append(value)
                    doc_id = cell_key.split(f"-{metric_id}")[0]
                    doc_ids.append(doc_id)
        
        # Parse numeric values
        parsed_values = []
        unit_types = []
        value_doc_map = []  # Map values to doc indices
        
        for idx, value_str in enumerate(metric_cells):
            parsed = self.parse_numeric_value(value_str)
            if parsed:
                value, unit_type = parsed
                parsed_values.append(value)
                unit_types.append(unit_type)
                value_doc_map.append(idx)
        
        # Determine unit type
        unit_type_counter = Counter(unit_types)
        most_common_unit = unit_type_counter.most_common(1)[0][0] if unit_types else None
        
        cardinality = len(parsed_values)
        units_consistent = len(set(unit_types)) <= 1 if unit_types else False
        
        # Use fallback (rule-based) in sync context
        return self._fallback_analyze_column(
            metric_label, parsed_values, most_common_unit,
            all_metrics, all_values_by_metric,
            value_doc_map, cardinality, units_consistent
        )
    
    async def analyze_matrix_async(
        self,
        metrics: List[Dict],
        cells: Dict[str, Dict]
    ) -> Dict[str, Dict]:
        """Analyze all columns in a matrix with LLM-driven intent resolution (async)."""
        
        # First pass: collect all values by metric for relationship detection
        all_values_by_metric = {}
        for metric in metrics:
            metric_id = metric.get('id')
            metric_label = metric.get('label', '')
            if metric_id:
                values = []
                for cell_key, cell_data in cells.items():
                    if f"-{metric_id}" in cell_key:
                        value = cell_data.get('value')
                        if value:
                            parsed = self.parse_numeric_value(value)
                            if parsed:
                                values.append(parsed[0])
                all_values_by_metric[metric_label] = values
        
        # Second pass: analyze each column (can be parallelized)
        tasks = []
        metric_ids = []
        for metric in metrics:
            metric_id = metric.get('id')
            metric_label = metric.get('label', '')
            if metric_id:
                metric_ids.append(metric_id)
                tasks.append(
                    self.analyze_column_async(
                        metric_id,
                        metric_label,
                        cells,
                        metrics,
                        all_values_by_metric
                    )
                )
        
        # Run all analyses concurrently
        results_list = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Build results dict
        results = {}
        for metric_id, result in zip(metric_ids, results_list):
            if isinstance(result, Exception):
                log_error("Error analyzing column", error=result, metric_id=metric_id)
                # Return a safe default
                results[metric_id] = {
                    'visualizable': False,
                    'cardinality': 0,
                    'values': [],
                    'value_doc_indices': [],
                    'error': str(result)
                }
            else:
                results[metric_id] = result
        
        return results
    
    def analyze_matrix(
        self,
        metrics: List[Dict],
        cells: Dict[str, Dict]
    ) -> Dict[str, Dict]:
        """Analyze all columns in a matrix (sync wrapper for backward compatibility)."""
        
        # First pass: collect all values by metric for relationship detection
        all_values_by_metric = {}
        for metric in metrics:
            metric_id = metric.get('id')
            metric_label = metric.get('label', '')
            if metric_id:
                values = []
                for cell_key, cell_data in cells.items():
                    if f"-{metric_id}" in cell_key:
                        value = cell_data.get('value')
                        if value:
                            parsed = self.parse_numeric_value(value)
                            if parsed:
                                values.append(parsed[0])
                all_values_by_metric[metric_label] = values
        
        # Second pass: full analysis with intent (sync, no LLM)
        results = {}
        for metric in metrics:
            metric_id = metric.get('id')
            metric_label = metric.get('label', '')
            if metric_id:
                results[metric_id] = self.analyze_column(
                    metric_id,
                    metric_label,
                    cells,
                    metrics,
                    all_values_by_metric
                )
        
        return results


visualization_service = VisualizationService()
