import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { X, Lightbulb } from 'lucide-react';
import { VisualizationSpec } from '../services/api';

interface AnalyticalOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  question: string;
  answerSummary: string;
  visualization: VisualizationSpec | null;
  isLoading: boolean;
}

export const AnalyticalOverlay: React.FC<AnalyticalOverlayProps> = ({
  isOpen,
  onClose,
  question,
  answerSummary,
  visualization,
  isLoading,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Render visualization
  useEffect(() => {
    if (!svgRef.current || !visualization || isLoading) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 520;
    const height = 280;
    const margin = { top: 30, right: 30, bottom: 45, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const data = visualization.data || [];
    if (data.length === 0) return;

    const type = visualization.type?.toUpperCase() || 'LOLLIPOP';

    // Format value for display
    const formatValue = (v: number): string => {
      const unit = visualization.y_axis?.unit?.toLowerCase();
      if (unit === 'currency' || unit === 'eur') {
        if (Math.abs(v) >= 1000000) return `€${(v / 1000000).toFixed(1)}M`;
        if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(0)}K`;
        return `€${v.toFixed(0)}`;
      }
      if (unit === 'percentage' || unit === '%') {
        return `${v.toFixed(1)}%`;
      }
      if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
      if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}K`;
      return v.toFixed(1);
    };

    // Render based on type
    if (type === 'LOLLIPOP' || type === 'COMPARISON') {
      renderLollipop(g, data, chartWidth, chartHeight, formatValue);
    } else if (type === 'HISTOGRAM' || type === 'DISTRIBUTION') {
      renderHistogram(g, data, chartWidth, chartHeight, formatValue);
    } else if (type === 'LINE' || type === 'TREND') {
      renderLine(g, data, chartWidth, chartHeight, formatValue);
    } else if (type === 'SCATTER' || type === 'RELATIONSHIP') {
      renderScatter(g, data, chartWidth, chartHeight, formatValue);
    } else if (type === 'DELTA_BAR' || type === 'DELTA') {
      renderDeltaBar(g, data, chartWidth, chartHeight, formatValue);
    } else {
      // Default to lollipop
      renderLollipop(g, data, chartWidth, chartHeight, formatValue);
    }

    // Add title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255, 255, 255, 0.7)')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .text(visualization.title || '');

    // Add Y axis label
    if (visualization.y_axis?.label) {
      svg.append('text')
        .attr('transform', `translate(16, ${height / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255, 255, 255, 0.4)')
        .attr('font-size', '9px')
        .text(visualization.y_axis.label);
    }

  }, [visualization, isLoading]);

  const renderLollipop = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: Array<{ label: string; value: number; highlight?: boolean }>,
    chartWidth: number,
    chartHeight: number,
    formatValue: (v: number) => string
  ) => {
    const sortedData = [...data].sort((a, b) => b.value - a.value);

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(sortedData, d => d.value) || 1])
      .range([0, chartWidth]);

    const yScale = d3.scaleBand()
      .domain(sortedData.map(d => d.label))
      .range([0, chartHeight])
      .padding(0.4);

    // Baseline
    g.append('line')
      .attr('x1', 0).attr('x2', 0)
      .attr('y1', 0).attr('y2', chartHeight)
      .attr('stroke', 'rgba(16, 185, 129, 0.2)')
      .attr('stroke-width', 1);

    // Lollipops
    const items = g.selectAll('.lollipop')
      .data(sortedData)
      .enter()
      .append('g')
      .attr('class', 'lollipop');

    // Sticks
    items.append('line')
      .attr('x1', 0)
      .attr('x2', d => xScale(d.value))
      .attr('y1', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2)
      .attr('y2', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2)
      .attr('stroke', d => d.highlight ? 'rgba(16, 185, 129, 0.6)' : 'rgba(16, 185, 129, 0.3)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', d => d.highlight ? 'none' : '4 2');

    // Circles
    items.append('circle')
      .attr('cx', d => xScale(d.value))
      .attr('cy', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2)
      .attr('r', d => d.highlight ? 8 : 6)
      .attr('fill', d => d.highlight ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.2)')
      .attr('stroke', d => d.highlight ? 'rgba(16, 185, 129, 1)' : 'rgba(16, 185, 129, 0.6)')
      .attr('stroke-width', 2);

    // Value labels
    items.append('text')
      .attr('x', d => xScale(d.value) + 10)
      .attr('y', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2 + 3)
      .attr('fill', d => d.highlight ? 'rgba(16, 185, 129, 1)' : 'rgba(255, 255, 255, 0.5)')
      .attr('font-size', '9px')
      .attr('font-weight', d => d.highlight ? '600' : '400')
      .text(d => formatValue(d.value));

    // Y axis labels
    g.selectAll('.y-label')
      .data(sortedData)
      .enter()
      .append('text')
      .attr('x', -8)
      .attr('y', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2 + 3)
      .attr('text-anchor', 'end')
      .attr('fill', d => d.highlight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.5)')
      .attr('font-size', '9px')
      .attr('font-weight', d => d.highlight ? '500' : '400')
      .text(d => d.label.substring(0, 18));
  };

  const renderHistogram = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: Array<{ label: string; value: number; highlight?: boolean }>,
    chartWidth: number,
    chartHeight: number,
    formatValue: (v: number) => string
  ) => {
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([0, chartWidth])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 1])
      .range([chartHeight, 0]);

    // Bars
    g.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', d => xScale(d.label) || 0)
      .attr('y', d => yScale(d.value))
      .attr('width', xScale.bandwidth())
      .attr('height', d => chartHeight - yScale(d.value))
      .attr('fill', d => d.highlight ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.25)')
      .attr('stroke', d => d.highlight ? 'rgba(16, 185, 129, 1)' : 'rgba(16, 185, 129, 0.5)')
      .attr('stroke-width', 1)
      .attr('rx', 3);

    // X axis labels
    g.selectAll('.x-label')
      .data(data)
      .enter()
      .append('text')
      .attr('x', d => (xScale(d.label) || 0) + xScale.bandwidth() / 2)
      .attr('y', chartHeight + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255, 255, 255, 0.5)')
      .attr('font-size', '8px')
      .text(d => d.label.substring(0, 10));
  };

  const renderLine = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: Array<{ label: string; value: number; highlight?: boolean }>,
    chartWidth: number,
    chartHeight: number,
    formatValue: (v: number) => string
  ) => {
    const xScale = d3.scalePoint()
      .domain(data.map(d => d.label))
      .range([0, chartWidth]);

    const yExtent = d3.extent(data, d => d.value) as [number, number];
    const yPadding = (yExtent[1] - yExtent[0]) * 0.1;
    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([chartHeight, 0]);

    // Line
    const line = d3.line<{ label: string; value: number }>()
      .x(d => xScale(d.label) || 0)
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(16, 185, 129, 0.8)')
      .attr('stroke-width', 2.5);

    // Points
    g.selectAll('.point')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(d.label) || 0)
      .attr('cy', d => yScale(d.value))
      .attr('r', d => d.highlight ? 6 : 4)
      .attr('fill', d => d.highlight ? 'rgba(16, 185, 129, 0.6)' : 'rgba(2, 12, 8, 1)')
      .attr('stroke', 'rgba(16, 185, 129, 0.9)')
      .attr('stroke-width', 2);

    // X axis labels
    g.selectAll('.x-label')
      .data(data)
      .enter()
      .append('text')
      .attr('x', d => xScale(d.label) || 0)
      .attr('y', chartHeight + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255, 255, 255, 0.5)')
      .attr('font-size', '8px')
      .text(d => d.label.substring(0, 8));
  };

  const renderScatter = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: Array<{ label: string; value: number; highlight?: boolean }>,
    chartWidth: number,
    chartHeight: number,
    formatValue: (v: number) => string
  ) => {
    // For scatter, use index as X
    const xScale = d3.scaleLinear()
      .domain([0, data.length - 1])
      .range([0, chartWidth]);

    const yExtent = d3.extent(data, d => d.value) as [number, number];
    const yScale = d3.scaleLinear()
      .domain(yExtent)
      .range([chartHeight, 0]);

    // Points
    g.selectAll('.point')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (_, i) => xScale(i))
      .attr('cy', d => yScale(d.value))
      .attr('r', d => d.highlight ? 6 : 4)
      .attr('fill', d => d.highlight ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.2)')
      .attr('stroke', d => d.highlight ? 'rgba(16, 185, 129, 1)' : 'rgba(16, 185, 129, 0.6)')
      .attr('stroke-width', 1.5);

    // Labels
    g.selectAll('.label')
      .data(data)
      .enter()
      .append('text')
      .attr('x', (_, i) => xScale(i))
      .attr('y', d => yScale(d.value) - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255, 255, 255, 0.5)')
      .attr('font-size', '8px')
      .text(d => d.label.substring(0, 7));
  };

  const renderDeltaBar = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    data: Array<{ label: string; value: number; highlight?: boolean }>,
    chartWidth: number,
    chartHeight: number,
    formatValue: (v: number) => string
  ) => {
    const maxAbs = Math.max(...data.map(d => Math.abs(d.value)));
    const xScale = d3.scaleLinear()
      .domain([-maxAbs * 1.1, maxAbs * 1.1])
      .range([0, chartWidth]);

    const yScale = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([0, chartHeight])
      .padding(0.3);

    const centerX = xScale(0);

    // Center line
    g.append('line')
      .attr('x1', centerX).attr('x2', centerX)
      .attr('y1', 0).attr('y2', chartHeight)
      .attr('stroke', 'rgba(255, 255, 255, 0.25)')
      .attr('stroke-width', 1);

    // Bars
    g.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', d => d.value >= 0 ? centerX : xScale(d.value))
      .attr('y', d => yScale(d.label) || 0)
      .attr('width', d => Math.abs(xScale(d.value) - centerX))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => d.value >= 0 ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)')
      .attr('stroke', d => d.value >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)')
      .attr('stroke-width', 1)
      .attr('rx', 2);

    // Labels
    g.selectAll('.label')
      .data(data)
      .enter()
      .append('text')
      .attr('x', d => d.value >= 0 ? centerX - 8 : centerX + 8)
      .attr('y', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2 + 3)
      .attr('text-anchor', d => d.value >= 0 ? 'end' : 'start')
      .attr('fill', 'rgba(255, 255, 255, 0.6)')
      .attr('font-size', '9px')
      .text(d => d.label.substring(0, 12));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center text-[11px]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#030a06]/95 border border-white/8 rounded-xl shadow-xl max-w-[560px] w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/8 flex items-start justify-between">
          <div className="flex-1 pr-3">
            <p className="text-emerald-400 text-[10px] font-medium mb-0.5 uppercase tracking-wider">Analytical Question</p>
            <h2 className="text-white text-[13px] font-light">{question}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-14">
              <div className="flex flex-col items-center gap-3">
                <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-white/40 text-[10px]">Analyzing matrix...</p>
              </div>
            </div>
          ) : visualization ? (
            <>
              {/* Answer Summary */}
              <div className="mb-4 p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-md">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-white/70 text-[11px] leading-relaxed">{answerSummary}</p>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-black/25 rounded-lg p-3 border border-white/4">
                <svg
                  ref={svgRef}
                  width={520}
                  height={280}
                  className="w-full"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
              </div>

              {/* Insight */}
              {visualization.insight && (
                <p className="mt-3 text-white/40 text-[10px] text-center italic">
                  {visualization.insight}
                </p>
              )}
            </>
          ) : (
            <div className="py-14 text-center text-white/30 text-[10px]">
              No visualization available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


