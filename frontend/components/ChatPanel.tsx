
import React, { useState, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { 
  MessageSquare, 
  Send, 
  Loader2, 
  ChevronRight,
  Sparkles,
  FileText,
  Grid3X3,
  AlertCircle,
  Trash2,
  X
} from 'lucide-react';
import { api, ChatMessage, ChatResponse, Citation, MatrixContext, VisualizationSpec, AnalyticalQuestion } from '../services/api';

interface AnalyticalAnswer {
  question: AnalyticalQuestion;
  answerSummary: string;
  visualization: VisualizationSpec | null;
  isLoading: boolean;
}

interface ChatPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  matrixContext: MatrixContext;
  onCellHighlight: (docId: string, metricId: string) => void;
  onDocumentOpen: (docId: string, section?: string) => void;
  analyticalAnswer?: AnalyticalAnswer | null;
  onClearAnalyticalAnswer?: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onToggle,
  matrixContext,
  onCellHighlight,
  onDocumentOpen,
  analyticalAnswer,
  onClearAnalyticalAnswer,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Render chart when analytical answer has visualization
  useEffect(() => {
    if (!chartRef.current || !analyticalAnswer?.visualization || analyticalAnswer.isLoading) return;

    const svg = d3.select(chartRef.current);
    svg.selectAll('*').remove();

    const width = 250;
    const height = 150;
    const margin = { top: 8, right: 12, bottom: 22, left: 36 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const visualization = analyticalAnswer.visualization;
    const rawData = visualization.data || [];
    
    // Type for chart data points
    type DataPoint = { label: string; value: number; highlight?: boolean };
    
    // Filter and validate data - ensure numeric values
    // Allow up to 10 data points to ensure all entities are shown
    const data: DataPoint[] = rawData
      .filter((d): d is DataPoint => d && typeof d.label === 'string' && typeof d.value === 'number' && !isNaN(d.value) && isFinite(d.value))
      .slice(0, 10);
    
    if (data.length === 0) {
      // Fallback message for empty/invalid data
      svg.append('text')
        .attr('x', width / 2).attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255, 255, 255, 0.25)')
        .attr('font-size', '8px')
        .text('No numeric data');
      return;
    }

    const type = visualization.type?.toUpperCase() || 'BAR';

    // Compact value formatter
    const fmt = (v: number): string => {
      if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
      if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
      return v % 1 === 0 ? v.toString() : v.toFixed(1);
    };

    // Check if data has positive and negative values (for delta visualization)
    const hasNegatives = data.some(d => d.value < 0);
    const maxAbs = Math.max(...data.map(d => Math.abs(d.value)));

    // Choose rendering based on type and data characteristics
    if (type === 'SCATTER' || type === 'RELATIONSHIP' || type === 'CORRELATION') {
      // Scatter plot - use index as X if no x values provided
      const xScale = d3.scaleLinear().domain([0, data.length - 1]).range([0, chartWidth]);
      const yExtent = d3.extent(data, d => d.value) as [number, number];
      const yPadding = (yExtent[1] - yExtent[0]) * 0.1 || 1;
      const yScale = d3.scaleLinear()
        .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
        .range([chartHeight, 0]);

      // Trend line
      const line = d3.line<typeof data[0]>()
        .x((_, i) => xScale(i)).y(d => yScale(d.value)).curve(d3.curveMonotoneX);
      g.append('path').datum(data).attr('d', line)
        .attr('fill', 'none').attr('stroke', 'rgba(16, 185, 129, 0.3)').attr('stroke-width', 1.5);

      // Points
      g.selectAll('.point').data(data).enter().append('circle')
        .attr('cx', (_, i) => xScale(i)).attr('cy', d => yScale(d.value))
        .attr('r', d => d.highlight ? 5 : 4)
        .attr('fill', d => d.highlight ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.25)')
        .attr('stroke', 'rgba(16, 185, 129, 0.8)').attr('stroke-width', 1);

      // Labels for highlighted points only
      g.selectAll('.label').data(data.filter(d => d.highlight)).enter().append('text')
        .attr('x', (d) => xScale(data.indexOf(d))).attr('y', d => yScale(d.value) - 6)
        .attr('text-anchor', 'middle').attr('fill', 'rgba(255, 255, 255, 0.5)').attr('font-size', '7px')
        .text(d => d.label.substring(0, 5));

    } else if (type === 'LINE' || type === 'TREND' || type === 'AREA') {
      const xScale = d3.scalePoint().domain(data.map(d => d.label)).range([0, chartWidth]).padding(0.1);
      const yExtent = d3.extent(data, d => d.value) as [number, number];
      const yPadding = (yExtent[1] - yExtent[0]) * 0.15 || 1;
      const yScale = d3.scaleLinear()
        .domain([Math.min(0, yExtent[0] - yPadding), yExtent[1] + yPadding])
        .range([chartHeight, 0]);

      // Area fill
      if (type === 'AREA') {
        const area = d3.area<typeof data[0]>()
          .x(d => xScale(d.label) || 0).y0(chartHeight).y1(d => yScale(d.value)).curve(d3.curveMonotoneX);
        g.append('path').datum(data).attr('d', area).attr('fill', 'rgba(16, 185, 129, 0.1)');
      }

      // Line
      const line = d3.line<typeof data[0]>()
        .x(d => xScale(d.label) || 0).y(d => yScale(d.value)).curve(d3.curveMonotoneX);
      g.append('path').datum(data).attr('d', line)
        .attr('fill', 'none').attr('stroke', 'rgba(16, 185, 129, 0.8)').attr('stroke-width', 2);

      // Points
      g.selectAll('.point').data(data).enter().append('circle')
        .attr('cx', d => xScale(d.label) || 0).attr('cy', d => yScale(d.value)).attr('r', 3)
        .attr('fill', d => d.highlight ? 'rgba(16, 185, 129, 0.6)' : 'rgba(2, 12, 8, 1)')
        .attr('stroke', 'rgba(16, 185, 129, 0.9)').attr('stroke-width', 1.5);

      // X axis labels (sparse)
      const labelIndices = data.length <= 4 ? data.map((_, i) => i) : [0, Math.floor(data.length / 2), data.length - 1];
      g.selectAll('.x-label').data(labelIndices.map(i => data[i])).enter().append('text')
        .attr('x', d => xScale(d.label) || 0).attr('y', chartHeight + 12)
        .attr('text-anchor', 'middle').attr('fill', 'rgba(255, 255, 255, 0.35)').attr('font-size', '6px')
        .text(d => d.label.substring(0, 5));

    } else if (type === 'DELTA_BAR' || type === 'DELTA' || type === 'WATERFALL' || hasNegatives) {
      // Delta bars (horizontal, centered at 0)
      const xScale = d3.scaleLinear().domain([-maxAbs * 1.1, maxAbs * 1.1]).range([0, chartWidth]);
      const yScale = d3.scaleBand().domain(data.map(d => d.label)).range([0, chartHeight]).padding(0.35);
      const centerX = xScale(0);

      // Center line
      g.append('line').attr('x1', centerX).attr('x2', centerX).attr('y1', 0).attr('y2', chartHeight)
        .attr('stroke', 'rgba(255, 255, 255, 0.15)').attr('stroke-width', 1);

      // Bars
      g.selectAll('.bar').data(data).enter().append('rect')
        .attr('x', d => d.value >= 0 ? centerX : xScale(d.value))
        .attr('y', d => yScale(d.label) || 0)
        .attr('width', d => Math.abs(xScale(d.value) - centerX))
        .attr('height', yScale.bandwidth())
        .attr('fill', d => d.value >= 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.35)')
        .attr('rx', 2);

      // Labels
      g.selectAll('.label').data(data).enter().append('text')
        .attr('x', d => d.value >= 0 ? centerX - 3 : centerX + 3)
        .attr('y', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2 + 2)
        .attr('text-anchor', d => d.value >= 0 ? 'end' : 'start')
        .attr('fill', 'rgba(255, 255, 255, 0.45)').attr('font-size', '6px')
        .text(d => d.label.substring(0, 8));

    } else if (type === 'LOLLIPOP' || type === 'COMPARISON' || type === 'RANKING') {
      // Horizontal lollipop (sorted by value)
      const sortedData = [...data].sort((a, b) => b.value - a.value);
      const xScale = d3.scaleLinear().domain([0, d3.max(sortedData, d => d.value) || 1]).range([0, chartWidth]);
      const yScale = d3.scaleBand().domain(sortedData.map(d => d.label)).range([0, chartHeight]).padding(0.4);

      // Sticks
      g.selectAll('.stick').data(sortedData).enter().append('line')
        .attr('x1', 0).attr('x2', d => xScale(d.value))
        .attr('y1', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2)
        .attr('y2', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2)
        .attr('stroke', d => d.highlight ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.25)')
        .attr('stroke-width', 2);

      // Circles
      g.selectAll('.circle').data(sortedData).enter().append('circle')
        .attr('cx', d => xScale(d.value))
        .attr('cy', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2)
        .attr('r', d => d.highlight ? 5 : 4)
        .attr('fill', d => d.highlight ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.2)')
        .attr('stroke', 'rgba(16, 185, 129, 0.7)').attr('stroke-width', 1.5);

      // Labels
      g.selectAll('.y-label').data(sortedData).enter().append('text')
        .attr('x', -3).attr('y', d => (yScale(d.label) || 0) + yScale.bandwidth() / 2 + 2)
        .attr('text-anchor', 'end').attr('fill', 'rgba(255, 255, 255, 0.45)').attr('font-size', '6px')
        .text(d => d.label.substring(0, 8));

    } else {
      // Default: vertical bars (HISTOGRAM, DISTRIBUTION, BAR)
      const xScale = d3.scaleBand().domain(data.map(d => d.label)).range([0, chartWidth]).padding(0.25);
      const yScale = d3.scaleLinear().domain([0, d3.max(data, d => d.value) || 1]).range([chartHeight, 0]);

      g.selectAll('.bar').data(data).enter().append('rect')
        .attr('x', d => xScale(d.label) || 0).attr('y', d => yScale(d.value))
        .attr('width', xScale.bandwidth()).attr('height', d => chartHeight - yScale(d.value))
        .attr('fill', d => d.highlight ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.25)')
        .attr('stroke', 'rgba(16, 185, 129, 0.5)').attr('rx', 2);

      // X labels
      g.selectAll('.x-label').data(data).enter().append('text')
        .attr('x', d => (xScale(d.label) || 0) + xScale.bandwidth() / 2).attr('y', chartHeight + 10)
        .attr('text-anchor', 'middle').attr('fill', 'rgba(255, 255, 255, 0.35)').attr('font-size', '6px')
        .text(d => d.label.substring(0, 5));
    }

  }, [analyticalAnswer]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    const query = input.trim();
    setInput('');
    setIsLoading(true);
    setError(null);
    setStreamingContent('');

    let accumulatedContent = '';
    let citations: Citation[] = [];

    try {
      await api.chatStream(
        query,
        matrixContext,
        // onText
        (text) => {
          accumulatedContent += text;
          setStreamingContent(accumulatedContent);
        },
        // onCitations
        (cits) => {
          citations = cits;
        },
        // onDone
        (messageId) => {
          const assistantMessage: ChatMessage = {
            id: messageId,
            role: 'assistant',
            content: accumulatedContent,
            timestamp: new Date().toISOString(),
            citations,
          };
          setMessages(prev => [...prev, assistantMessage]);
          setStreamingContent('');
          setIsLoading(false);
        },
        // onError
        (err) => {
          setError(err);
          setStreamingContent('');
          setIsLoading(false);
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response');
      setStreamingContent('');
      setIsLoading(false);
    }
  };

  const handleCitationClick = (citation: Citation) => {
    console.log('Citation clicked:', citation);
    
    if (citation.type === 'cell') {
      console.log(`Highlighting cell: doc=${citation.doc_id}, metric=${citation.metric_id}`);
      onCellHighlight(citation.doc_id, citation.metric_id);
    } else {
      console.log(`Opening document: doc=${citation.doc_id}, section=${citation.section}`);
      onDocumentOpen(citation.doc_id, citation.section || undefined);
    }
  };

  const clearHistory = async () => {
    await api.clearChatHistory();
    setMessages([]);
  };

  const renderCitation = (citation: Citation) => {
    const Icon = citation.type === 'cell' ? Grid3X3 : FileText;
    const label = citation.type === 'cell' 
      ? `${citation.doc_name} → ${citation.metric_label}`
      : `${citation.doc_name}${citation.section ? ` (${citation.section})` : ''}`;

    return (
      <button
        key={citation.index}
        onClick={() => handleCitationClick(citation)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/8 border border-emerald-500/15 rounded text-[9px] text-emerald-400 hover:bg-emerald-500/15 transition-all mr-1 mb-1"
        title={citation.type === 'cell' ? `Value: ${citation.value}` : citation.excerpt}
      >
        <Icon className="w-2.5 h-2.5" />
        [{citation.index}]
      </button>
    );
  };

  const renderMarkdownText = (text: string, keyPrefix: string = ''): React.ReactNode[] => {
    // Parse markdown: **bold**, *italic*, and line breaks
    const result: React.ReactNode[] = [];
    let remaining = text;
    let idx = 0;
    
    while (remaining.length > 0) {
      // Check for bold (**text**)
      const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
      if (boldMatch) {
        result.push(<strong key={`${keyPrefix}-b-${idx++}`} className="font-semibold text-white">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }
      
      // Check for italic (*text*)
      const italicMatch = remaining.match(/^\*(.+?)\*/);
      if (italicMatch) {
        result.push(<em key={`${keyPrefix}-i-${idx++}`} className="italic">{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }
      
      // Check for line break
      if (remaining.startsWith('\n')) {
        result.push(<br key={`${keyPrefix}-br-${idx++}`} />);
        remaining = remaining.slice(1);
        continue;
      }
      
      // Find next special character
      const nextSpecial = remaining.search(/\*|\n/);
      if (nextSpecial === -1) {
        result.push(<span key={`${keyPrefix}-t-${idx++}`}>{remaining}</span>);
        break;
      } else if (nextSpecial > 0) {
        result.push(<span key={`${keyPrefix}-t-${idx++}`}>{remaining.slice(0, nextSpecial)}</span>);
        remaining = remaining.slice(nextSpecial);
      } else {
        // nextSpecial === 0 but no match, just take the character
        result.push(<span key={`${keyPrefix}-t-${idx++}`}>{remaining[0]}</span>);
        remaining = remaining.slice(1);
      }
    }
    
    return result;
  };

  const renderMessageContent = (content: string, citations?: Citation[]) => {
    // Split by citations [n] first, then render markdown within each part
    const parts = content.split(/(\[\d+\])/g);
    
    return (
      <div className="text-[11px] text-slate-200 leading-relaxed">
        {parts.map((part, i) => {
          const match = part.match(/\[(\d+)\]/);
          if (match && citations && citations.length > 0) {
            const index = parseInt(match[1]);
            // Try to find by exact index first, then fallback to array position
            let citation = citations.find(c => c.index === index);
            if (!citation && index > 0 && index <= citations.length) {
              citation = citations[index - 1];
            }
            if (citation) {
              return (
                <button
                  key={i}
                  onClick={() => handleCitationClick(citation)}
                  className="inline-flex items-center justify-center min-w-[1.25rem] px-1 py-0 mx-0.5 bg-emerald-500/15 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/25 font-semibold rounded transition-all cursor-pointer border border-emerald-500/25 hover:border-emerald-400/40 text-[9px]"
                  title={citation.type === 'cell' ? `${citation.doc_name} → ${citation.metric_label}` : citation.doc_name}
                >
                  {part}
                </button>
              );
            }
          }
          // Render markdown for non-citation text
          return <span key={i}>{renderMarkdownText(part, `p${i}`)}</span>;
        })}
      </div>
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-4 top-1/2 -translate-y-1/2 z-50 w-8 h-16 glass-surface rounded-l-xl border border-emerald-500/15 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/10 transition-all shadow-md"
        title="Open Analytical Assistant"
      >
        <MessageSquare className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div className="w-[288px] h-full glass-surface rounded-xl border border-emerald-500/15 flex flex-col overflow-hidden shadow-xl text-[12px]">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-[11px] font-semibold text-white uppercase tracking-wider">Analyst</h3>
            <p className="text-[9px] text-emerald-500/60 uppercase tracking-widest">Matrix-First</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded-md hover:bg-white/5"
            title="Clear history"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-md hover:bg-white/5"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar">
        {/* Analytical Lens - ephemeral insight panel */}
        {analyticalAnswer && (
          <div className="relative bg-[#030a06]/80 border border-emerald-500/12 rounded-md overflow-hidden animate-fade-in">
            {/* Dismiss button */}
            {onClearAnalyticalAnswer && (
              <button
                onClick={onClearAnalyticalAnswer}
                className="absolute top-2 right-2 z-10 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                title="Dismiss lens"
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Question as label */}
            <div className="px-2.5 pt-2.5 pb-2">
              <p className="text-[10px] text-slate-300 leading-snug pr-6">
                {analyticalAnswer.question.question}
              </p>
            </div>

            {analyticalAnswer.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : analyticalAnswer.visualization ? (
              <>
                {/* Chart */}
                <div className="px-2 pb-1.5">
                  <svg
                    ref={chartRef}
                    width={250}
                    height={150}
                    className="w-full"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>

                {/* Single takeaway - concise */}
                {(analyticalAnswer.visualization.insight || analyticalAnswer.answerSummary) && (
                  <div className="px-2.5 pb-2.5">
                    <p className="text-[9px] text-emerald-400/60 leading-relaxed">
                      {/* Use insight if available, otherwise truncate answer summary */}
                      {analyticalAnswer.visualization.insight || 
                       (analyticalAnswer.answerSummary.length > 70 
                         ? analyticalAnswer.answerSummary.substring(0, 70) + '…' 
                         : analyticalAnswer.answerSummary)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="py-6 text-center text-slate-500 text-[9px]">
                Unable to visualize
              </div>
            )}
          </div>
        )}

        {messages.length === 0 && !analyticalAnswer && (
          <div className="text-center py-8">
            <Sparkles className="w-7 h-7 text-emerald-500/40 mx-auto mb-3" />
            <p className="text-[9px] text-emerald-400/70 uppercase tracking-widest mb-1.5">Analyst Ready</p>
            <p className="text-[10px] text-slate-400 max-w-[180px] mx-auto leading-relaxed">
              Ask about your matrix data. I'll cite cells and documents.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`${message.role === 'user' ? 'ml-4' : 'mr-2'}`}
          >
            <div
              className={`p-2.5 rounded-lg ${
                message.role === 'user'
                  ? 'bg-emerald-500/8 border border-emerald-500/15 rounded-br-sm'
                  : 'bg-white/[0.02] border border-white/[0.04] rounded-bl-sm'
              }`}
            >
              {message.role === 'assistant' ? (
                <>
                  {renderMessageContent(message.content, message.citations)}
                  
                  {/* Citations reference */}
                  {message.citations && message.citations.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
                      <p className="text-[8px] text-slate-500 uppercase tracking-widest mb-1.5">References</p>
                      <div className="flex flex-wrap">
                        {message.citations.map(renderCitation)}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[12px] text-slate-200">{message.content}</p>
              )}
            </div>
            <p className="text-[8px] text-slate-500 mt-1 px-1.5">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ))}

        {isLoading && (
          <div className="mr-2">
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] rounded-bl-sm">
              {streamingContent ? (
                <div className="text-[11px] text-slate-200 leading-relaxed">
                  {renderMarkdownText(streamingContent, 'stream')}
                  <span className="inline-block w-1.5 h-3 bg-emerald-400 animate-pulse ml-0.5" />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-emerald-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[9px] uppercase tracking-wider">Analyzing...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-rose-400 p-2.5 bg-rose-500/8 rounded-md border border-rose-500/15">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span className="text-[10px]">{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2.5 border-t border-white/[0.05]">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask about your matrix..."
            className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-2 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/30 transition-colors"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-2 bg-emerald-500/15 border border-emerald-500/25 rounded-md text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[8px] text-emerald-500/50 mt-2 text-center font-mono">
          {matrixContext.documents.length} docs • {Object.keys(matrixContext.cells).length} cells
        </p>
      </div>
    </div>
  );
};

export default ChatPanel;

