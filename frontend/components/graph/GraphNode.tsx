
import React, { useState, useEffect, useRef } from 'react';
import { GraphNode as NodeType } from '../../types';
import { Expand, Check, Plus, Trash2, Sparkles, ArrowRight } from 'lucide-react';

export type EdgeDirection = 'top' | 'bottom' | 'left' | 'right';
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface GraphNodeProps {
  node: NodeType;
  onExpand: (query?: string) => Promise<void>;
  isSelected: boolean;
  isDragging: boolean;
  isResizing?: boolean;
  onToggleSelect: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onEdgeDragStart?: (direction: EdgeDirection, e: React.MouseEvent) => void;
  onResizeStart?: (handle: ResizeHandle, e: React.MouseEvent) => void;
  onDelete?: () => void;
  onMergeSelect?: (query: string) => void;
  onGetExpandSuggestions?: () => Promise<{ suggestions: string[] }>;
  parentNodeNames?: { source: string; target: string };
  isEdgeTarget?: boolean;
  innerRef?: (el: HTMLDivElement | null) => void;
}

const GraphNode: React.FC<GraphNodeProps> = ({
  node,
  onExpand,
  isSelected,
  isDragging,
  isResizing,
  onToggleSelect,
  onDragStart,
  onEdgeDragStart,
  onResizeStart,
  onDelete,
  onMergeSelect,
  onGetExpandSuggestions,
  parentNodeNames,
  isEdgeTarget,
  innerRef
}) => {
  const [isNew, setIsNew] = useState(true);
  const [mergeQuery, setMergeQuery] = useState('');
  const [isExpandMode, setIsExpandMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandQuery, setExpandQuery] = useState('');
  const [expandSuggestions, setExpandSuggestions] = useState<string[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const expandInputRef = useRef<HTMLInputElement>(null);

  // Entry animation - node scales in when first rendered
  useEffect(() => {
    const timer = setTimeout(() => setIsNew(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const colorClasses: Record<string, string> = {
    yellow: 'graph-node-yellow',
    red: 'graph-node-red',
    blue: 'graph-node-blue',
    green: 'graph-node-green',
    slate: 'graph-node-slate',
    orange: 'graph-node-orange'
  };

  const colorClass = colorClasses[node.color] || colorClasses.slate;
  const isPendingMerge = !!node.pendingMerge;

  const handleEdgeMouseDown = (direction: EdgeDirection, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onEdgeDragStart?.(direction, e);
  };

  const handleResizeMouseDown = (handle: ResizeHandle, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onResizeStart?.(handle, e);
  };

  // Connection point component
  const ConnectionPoint = ({ direction, className }: { direction: EdgeDirection; className: string }) => (
    <div
      className={`absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${className}`}
      onMouseDown={(e) => handleEdgeMouseDown(direction, e)}
    >
      <button
        className="w-4 h-4 rounded-full flex items-center justify-center shadow-sm transition-all hover:scale-110 hover:brightness-110 cursor-crosshair border border-white/10"
        style={{ backgroundColor: 'var(--node-accent)' }}
      >
        <Plus className="w-2.5 h-2.5 text-white" />
      </button>
    </div>
  );


  const nodeWidth = node.width || 300;
  const nodeHeight = node.height;

  return (
    <div
      className={`absolute graph-node-card group cursor-grab active:cursor-grabbing select-none ${colorClass}
        ${isSelected ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-[#030a06]' : ''} 
        ${isDragging || isResizing ? 'opacity-90 shadow-2xl z-50' : 'shadow-xl z-20'}
        ${isNew && !isDragging ? 'graph-node-enter' : ''}
        ${isEdgeTarget ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#030a06] scale-[1.02]' : ''}`}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: nodeWidth,
        height: isExpandMode ? 'auto' : nodeHeight,
        minWidth: 200,
        minHeight: nodeHeight || 150,
        transition: isDragging || isResizing ? 'none' : 'box-shadow 0.2s ease, transform 0.2s ease'
      }}
      onMouseDown={onDragStart}
      data-node-id={node.id}
      ref={innerRef}
    >
      <div
        className="rounded-2xl overflow-hidden flex flex-col h-full backdrop-blur-xl"
        style={{
          background: isPendingMerge ? 'rgba(251, 146, 60, 0.08)' : 'var(--node-bg)',
          border: isPendingMerge ? '1px solid rgba(251, 146, 60, 0.3)' : '1px solid var(--node-border)'
        }}
      >
        {/* Color Header Bar */}
        <div
          className="h-1.5"
          style={{ background: isPendingMerge ? 'linear-gradient(90deg, #f97316, #fb923c)' : 'var(--node-header)' }}
        />

        {isPendingMerge ? (
          // MERGE NODE UI - Orange themed with AI suggestions
          <div className="p-5 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-400" />
                <span className="text-[10px] text-orange-400 uppercase tracking-wider font-bold">Merge Nodes</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {onDelete && (
                  <button
                    onMouseDown={(e) => { e.stopPropagation(); onDelete(); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                    title="Delete node"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Parent node names */}
            {parentNodeNames && (
              <div className="flex items-center gap-2 mb-4 text-[10px]">
                <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded truncate max-w-[100px]" title={parentNodeNames.source}>
                  {parentNodeNames.source}
                </span>
                <span className="text-orange-400">+</span>
                <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded truncate max-w-[100px]" title={parentNodeNames.target}>
                  {parentNodeNames.target}
                </span>
              </div>
            )}

            {/* AI Suggestions */}
            {node.pendingMerge?.isLoadingSuggestions ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                <span className="text-[11px] text-orange-300/70">Generating suggestions...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mb-4">
                {node.pendingMerge?.suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onMouseDown={(e) => { e.stopPropagation(); onMergeSelect?.(suggestion); }}
                    className="px-3 py-2 bg-orange-500/15 hover:bg-orange-500/30 border border-orange-500/30 hover:border-orange-500/50 rounded-lg text-[11px] text-orange-200 hover:text-orange-100 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Custom query input */}
            <div className="mt-auto">
              <div className="flex gap-2">
                <input
                  ref={mergeInputRef}
                  type="text"
                  value={mergeQuery}
                  onChange={(e) => setMergeQuery(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && mergeQuery.trim()) {
                      onMergeSelect?.(mergeQuery);
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder="Or type custom query..."
                  className="flex-1 px-3 py-2 bg-black/30 border border-orange-500/20 rounded-lg text-[11px] text-white placeholder-orange-300/40 outline-none focus:border-orange-500/50"
                />
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (mergeQuery.trim()) onMergeSelect?.(mergeQuery);
                  }}
                  disabled={!mergeQuery.trim()}
                  className="p-2 bg-orange-500 text-black rounded-lg hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          // REGULAR NODE UI
          <>
            <div className="p-5">
              {/* Title Row */}
              <div className="flex items-start justify-between mb-4 gap-3">
                <h3
                  className="font-semibold text-[15px] leading-snug"
                  style={{ color: 'var(--node-text)' }}
                >
                  {node.title}
                </h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Delete Button */}
                  {onDelete && (
                    <button
                      onMouseDown={(e) => { e.stopPropagation(); onDelete(); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                      title="Delete node"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {/* Select Checkbox */}
                  <button
                    onMouseDown={(e) => { e.stopPropagation(); onToggleSelect(); }}
                    className={`w-5 h-5 rounded-full border transition-all flex items-center justify-center ${isSelected
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'border-slate-600 hover:border-slate-500'
                      }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-black" />}
                  </button>
                </div>
              </div>

              {/* Content Points */}
              <ul className="space-y-2.5">
                {node.content.map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 opacity-60"
                      style={{ background: 'var(--node-accent)' }}
                    />
                    <span
                      className="text-[12px] leading-relaxed font-light"
                      style={{ color: 'var(--node-text)', opacity: 0.8 }}
                    >
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Footer Actions */}
            <div className="px-5 pb-4 mt-auto">
              {isExpandMode ? (
                // Expand Mode UI with suggestions
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--node-accent)' }} />
                    <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--node-accent)' }}>Expansion Options</span>
                    {isFetchingSuggestions && (
                      <div className="w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin ml-2" />
                    )}
                    <button
                      onMouseDown={(e) => { e.stopPropagation(); setIsExpandMode(false); setExpandQuery(''); }}
                      className="ml-auto text-slate-500 hover:text-slate-300 text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  {/* AI Suggestions / Loading States */}
                  {isProcessing ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-3 bg-black/20 rounded-xl border border-white/5">
                      <div className="loading-waveform">
                        <div className="waveform-bar" />
                        <div className="waveform-bar" />
                        <div className="waveform-bar" />
                        <div className="waveform-bar" />
                        <div className="waveform-bar" />
                      </div>
                      <span className="text-[10px] text-emerald-500/70 uppercase tracking-widest font-bold animate-pulse">Brainstorming Node</span>
                    </div>
                  ) : isFetchingSuggestions ? (
                    <div className="py-2 px-1">
                      <span className="text-[10px] text-slate-500 italic">Finding best ways to expand...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {expandSuggestions.map((suggestion, i) => (
                          <button
                            key={i}
                            onMouseDown={async (e) => {
                              e.stopPropagation();
                              setIsProcessing(true);
                              try {
                                await onExpand(suggestion);
                              } finally {
                                setIsProcessing(false);
                                setIsExpandMode(false);
                                setExpandQuery('');
                              }
                            }}
                            className="px-3 py-2 rounded-lg text-[10px] transition-colors border text-left font-medium"
                            style={{
                              background: 'rgba(0, 0, 0, 0.4)',
                              borderColor: 'var(--node-border)',
                              color: 'var(--node-text)',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>

                      {/* Custom query input */}
                      <div className="flex gap-2 mt-3">
                        <input
                          ref={expandInputRef}
                          type="text"
                          value={expandQuery}
                          onChange={(e) => setExpandQuery(e.target.value)}
                          onKeyDown={async (e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter' && expandQuery.trim()) {
                              const query = expandQuery.trim();
                              setIsProcessing(true);
                              try {
                                await onExpand(query);
                              } finally {
                                setIsProcessing(false);
                                setIsExpandMode(false);
                                setExpandQuery('');
                              }
                            }
                            if (e.key === 'Escape') {
                              setIsExpandMode(false);
                              setExpandQuery('');
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          placeholder="Or type custom query..."
                          className="flex-1 px-3 py-2 bg-black/30 border rounded-lg text-[11px] text-white placeholder-slate-400 outline-none focus:border-opacity-50"
                          style={{ borderColor: 'var(--node-border)' }}
                        />
                        <button
                          onMouseDown={async (e) => {
                            e.stopPropagation();
                            if (expandQuery.trim()) {
                              const query = expandQuery.trim();
                              setIsProcessing(true);
                              try {
                                await onExpand(query);
                              } finally {
                                setIsProcessing(false);
                                setIsExpandMode(false);
                                setExpandQuery('');
                              }
                            }
                          }}
                          disabled={!expandQuery.trim()}
                          className="p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          style={{ background: 'var(--node-accent)', color: 'black' }}
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Normal expand button
                <div className="flex justify-end">
                  <button
                    onMouseDown={async (e) => {
                      e.stopPropagation();
                      setIsExpandMode(true);
                      setTimeout(() => expandInputRef.current?.focus(), 100);

                      if (onGetExpandSuggestions && expandSuggestions.length === 0) {
                        setIsFetchingSuggestions(true);
                        try {
                          const result = await onGetExpandSuggestions();
                          setExpandSuggestions(result.suggestions);
                        } catch (err) {
                          console.error("Failed to fetch expand suggestions:", err);
                        } finally {
                          setIsFetchingSuggestions(false);
                        }
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-[0.12em] transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                    style={{
                      background: 'var(--node-header)',
                      color: 'var(--node-text)'
                    }}
                  >
                    <Expand className="w-3 h-3" />
                    Expand
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Connection Points on all 4 sides */}
      {onEdgeDragStart && (
        <>
          <ConnectionPoint direction="top" className="-top-2.5 left-1/2 -translate-x-1/2" />
          <ConnectionPoint direction="bottom" className="-bottom-2.5 left-1/2 -translate-x-1/2" />
          <ConnectionPoint direction="left" className="top-1/2 -left-2.5 -translate-y-1/2" />
          <ConnectionPoint direction="right" className="top-1/2 -right-2.5 -translate-y-1/2" />
        </>
      )}

      {/* Invisible resize zones around the perimeter - cursor changes on hover */}
      {onResizeStart && (
        <>
          {/* Corner zones - small squares at each corner for diagonal resize */}
          <div
            className="absolute -top-1 -left-1 w-4 h-4 cursor-nw-resize z-40"
            onMouseDown={(e) => handleResizeMouseDown('nw', e)}
          />
          <div
            className="absolute -top-1 -right-1 w-4 h-4 cursor-ne-resize z-40"
            onMouseDown={(e) => handleResizeMouseDown('ne', e)}
          />
          <div
            className="absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize z-40"
            onMouseDown={(e) => handleResizeMouseDown('se', e)}
          />
          <div
            className="absolute -bottom-1 -left-1 w-4 h-4 cursor-sw-resize z-40"
            onMouseDown={(e) => handleResizeMouseDown('sw', e)}
          />

          {/* Edge zones - thin strips along each edge, split to avoid center (+) icons */}
          {/* Top edge: left and right portions, gap in middle for connection point */}
          <div
            className="absolute -top-1 left-4 h-2 cursor-n-resize z-30"
            style={{ width: 'calc(50% - 28px)' }}
            onMouseDown={(e) => handleResizeMouseDown('n', e)}
          />
          <div
            className="absolute -top-1 right-4 h-2 cursor-n-resize z-30"
            style={{ width: 'calc(50% - 28px)' }}
            onMouseDown={(e) => handleResizeMouseDown('n', e)}
          />

          {/* Bottom edge: left and right portions */}
          <div
            className="absolute -bottom-1 left-4 h-2 cursor-s-resize z-30"
            style={{ width: 'calc(50% - 28px)' }}
            onMouseDown={(e) => handleResizeMouseDown('s', e)}
          />
          <div
            className="absolute -bottom-1 right-4 h-2 cursor-s-resize z-30"
            style={{ width: 'calc(50% - 28px)' }}
            onMouseDown={(e) => handleResizeMouseDown('s', e)}
          />

          {/* Left edge: top and bottom portions */}
          <div
            className="absolute -left-1 top-4 w-2 cursor-w-resize z-30"
            style={{ height: 'calc(50% - 28px)' }}
            onMouseDown={(e) => handleResizeMouseDown('w', e)}
          />
          <div
            className="absolute -left-1 bottom-4 w-2 cursor-w-resize z-30"
            style={{ height: 'calc(50% - 28px)' }}
            onMouseDown={(e) => handleResizeMouseDown('w', e)}
          />

          {/* Right edge: top and bottom portions */}
          <div
            className="absolute -right-1 top-4 w-2 cursor-e-resize z-30"
            style={{ height: 'calc(50% - 28px)' }}
            onMouseDown={(e) => handleResizeMouseDown('e', e)}
          />
          <div
            className="absolute -right-1 bottom-4 w-2 cursor-e-resize z-30"
            style={{ height: 'calc(50% - 28px)' }}
            onMouseDown={(e) => handleResizeMouseDown('e', e)}
          />
        </>
      )}
    </div>
  );
};

export default GraphNode;
