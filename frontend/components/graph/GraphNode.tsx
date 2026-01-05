
import React, { useState, useEffect, useRef } from 'react';
import { GraphNode as NodeType } from '../../types';
import { Expand as ExpandIcon, Check, Plus, Trash2, Sparkles, ArrowRight, Search, MessageSquare, X, Pen, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  parentNodeNames?: string[];
  isEdgeTarget?: boolean;
  innerRef?: (el: HTMLDivElement | null) => void;
  onUpdate?: (content: string) => void;
  onExpandSelection?: (text: string) => void;
  onSummarizeSelection?: (text: string) => void;
  onCreateNodeFromSelection?: (selectedText: string, query: string) => void;
  onExtensionRequest?: (text: string) => void;
  onAttach?: () => void;
  onFocusRequest?: () => void;
  scale?: number;
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
  innerRef,
  onUpdate,
  onExpandSelection,
  onSummarizeSelection,
  onCreateNodeFromSelection,
  onExtensionRequest,
  onAttach,
  onFocusRequest,
  scale = 1
}) => {
  const [isNew, setIsNew] = useState(true);
  const [mergeQuery, setMergeQuery] = useState('');
  const [isExpandMode, setIsExpandMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandQuery, setExpandQuery] = useState('');
  const [expandSuggestions, setExpandSuggestions] = useState<string[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectionData, setSelectionData] = useState<{
    text: string;
    x: number;
    y: number;
    selectionHeight: number;
    showBelow: boolean;
    isSearchExpanded: boolean;
    searchQuery: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const expandInputRef = useRef<HTMLInputElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nodeContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isSelectingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // For GraphNode, we'll append the file reference to the content
    const file = files[0];
    const blobUrl = URL.createObjectURL(file);
    const fileMarkdown = `\n\n[File: ${file.name}](${blobUrl})`;

    const newContent = (displayText || '') + fileMarkdown;
    setDisplayText(newContent);
    onUpdate?.(newContent);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Entry animation - node scales in when first rendered
  useEffect(() => {
    const timer = setTimeout(() => setIsNew(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Handle clicking outside to close tooltip - also clears when clicking on canvas/other nodes
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // If click is outside the tooltip AND outside the content area, clear
      const clickedTooltip = tooltipRef.current?.contains(e.target as Node);
      const clickedContent = contentRef.current?.contains(e.target as Node);

      if (!clickedTooltip && !clickedContent) {
        setSelectionData(null);
        // Also clear the browser selection to remove highlight
        window.getSelection()?.removeAllRanges();
      }
    };

    if (selectionData) {
      // Use capture phase to catch before other handlers
      document.addEventListener('mousedown', handleClickOutside, true);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [selectionData]);

  // Listen for selection changes - if selection is cleared or moved elsewhere, clear our tooltip
  useEffect(() => {
    const handleSelectionChange = () => {
      if (selectionData) {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        // If no text is selected or selection is not in our content area, clear tooltip
        if (!selectedText) {
          setSelectionData(null);
        } else if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (contentRef.current && !contentRef.current.contains(range.commonAncestorContainer)) {
            setSelectionData(null);
          }
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [selectionData]);

  // Handle mouse down on content - track that selection might be starting
  const handleContentMouseDown = () => {
    // Clear any existing tooltip from this node when starting a new selection
    setSelectionData(null);
    isSelectingRef.current = true;
  };

  // Handle mouse leaving the content area - if selecting, clear selection to prevent bleed
  const handleContentMouseLeave = (e: React.MouseEvent) => {
    // Only act if mouse button is still pressed (actively selecting)
    if (e.buttons === 1 && isSelectingRef.current) {
      // Clear the selection entirely to prevent it from extending to other nodes
      window.getSelection()?.removeAllRanges();
      isSelectingRef.current = false;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    isSelectingRef.current = false;
    if (isEditing) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      const range = selection?.getRangeAt(0);
      const nodeRect = nodeContainerRef.current?.getBoundingClientRect();

      if (range && nodeRect) {
        // Get the full selection bounding box
        const fullRect = range.getBoundingClientRect();
        const selectionHeight = fullRect.height / scale;

        // Calculate position relative to node
        const selectionTopInNode = (fullRect.top - nodeRect.top) / scale;
        const selectionBottomInNode = (fullRect.bottom - nodeRect.top) / scale;
        const selectionCenterX = ((fullRect.left + fullRect.right) / 2 - nodeRect.left) / scale;

        // Tooltip height is approximately 40px
        const tooltipHeight = 45;

        // Determine if tooltip should show below (not enough room above)
        const showBelow = selectionTopInNode < tooltipHeight + 10;

        setSelectionData({
          text,
          x: selectionCenterX,
          y: showBelow ? selectionBottomInNode + 8 : selectionTopInNode - 8,
          selectionHeight,
          showBelow,
          isSearchExpanded: false,
          searchQuery: ''
        });

        // Trigger focus on highlight
        onFocusRequest?.();
      }
    } else {
      // Don't clear tooltip if we just clicked on it (covered by preventDefault on tooltip)
      // Otherwise clear it after a small delay
      const clickedTooltip = (e.target as HTMLElement).closest('.selection-tooltip');
      if (!clickedTooltip) {
        setTimeout(() => {
          if (!selectionData?.isSearchExpanded) {
            setSelectionData(null);
          }
        }, 150);
      }
    }
  };

  // Streaming effect
  useEffect(() => {
    if (!node.content) return;

    // If content is already partially streamed or if it's external update
    if (node.content !== displayText && !isStreaming) {
      // Start streaming characters if the content is significantly different (new node/expansion)
      // Otherwise just update (manual edit from elsewhere)
      if (node.content.length > displayText.length + 10 || displayText === '') {
        setIsStreaming(true);
        let currentPos = 0;
        const targetText = node.content;
        setDisplayText('');

        const interval = setInterval(() => {
          if (currentPos < targetText.length) {
            const char = targetText[currentPos];
            currentPos++;
            setDisplayText(prev => prev + char);
          } else {
            clearInterval(interval);
            setIsStreaming(false);
          }
        }, 15); // Adjust speed as needed

        return () => clearInterval(interval);
      } else {
        setDisplayText(node.content);
      }
    }
  }, [node.content]);

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [displayText, isEditing]);

  // Memoize Markdown components to prevent recreation on every render
  const markdownComponents = React.useMemo(() => ({
    p: ({ node, ...props }: any) => <p className="text-[12px] leading-relaxed font-light mb-2 last:mb-0" style={{ color: '#b9c0cc' }} {...props} />,
    ul: ({ node, ...props }: any) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
    li: ({ node, ...props }: any) => <li className="text-[12px] font-light" style={{ color: '#b9c0cc' }} {...props} />,
    h1: ({ node, ...props }: any) => <h1 className="text-sm font-bold mt-3 mb-1 text-white" {...props} />,
    h2: ({ node, ...props }: any) => <h2 className="text-xs font-bold mt-2 mb-1 text-white" {...props} />,
    h3: ({ node, ...props }: any) => <h3 className="text-[11px] font-bold mt-2 mb-1 text-white" {...props} />,
    code: ({ node, ...props }: any) => <code className="bg-white/5 rounded px-1 text-[11px] font-mono" {...props} />,
    strong: ({ node, ...props }: any) => <strong className="font-bold text-white/90" {...props} />,
    em: ({ node, ...props }: any) => <em className="italic opacity-80" {...props} />,
  }), []);

  // Memoize the rendered content to preserve DOM nodes and selection
  const renderedContent = React.useMemo(() => {
    if (/^\d+ document(s)? analyzed$|^Analyzing \d+ document(s)?\.\.\.$/.test(displayText)) {
      return (
        <div className="flex items-center gap-2 py-1.5 px-3 bg-white/5 border border-white/10 rounded-none w-fit group-hover:border-white/20 transition-all select-none">
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--node-accent)' }} />
          <span className="text-[11px] font-medium tracking-wide" style={{ color: '#b9c0cc' }}>
            {displayText}
          </span>
        </div>
      );
    }

    return (
      <>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {displayText || ' '}
        </ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-1.5 h-3 bg-white/40 ml-1 animate-pulse align-middle" />
        )}
      </>
    );
  }, [displayText, isStreaming, markdownComponents]);

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
        className="w-4 h-4 rounded-none flex items-center justify-center shadow-sm transition-all hover:scale-110 hover:brightness-110 cursor-crosshair border border-white/10"
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
        ${isSelected ? 'ring-2 ring-orange-500/40' : ''} 
        ${isDragging || isResizing ? 'opacity-90 shadow-xl z-50' : 'shadow-lg z-20'}
        ${isNew && !isDragging ? 'graph-node-enter' : ''}
        ${isEdgeTarget ? 'ring-2 ring-orange-400/40 scale-[1.01]' : ''}`}
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
      ref={(el) => {
        (nodeContainerRef as any).current = el;
        innerRef?.(el);
      }}
    >
      <div
        className="rounded-none flex flex-col h-full backdrop-blur-xl"
        style={{
          background: isPendingMerge ? 'rgba(251, 146, 60, 0.08)' : 'var(--node-bg)',
          border: isPendingMerge ? '1px solid rgba(251, 146, 60, 0.3)' : '1px solid var(--node-border)',
          overflow: 'visible'
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
                <Sparkles className="w-4 h-4 text-emerald-500/60" />
                <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#e6eaf0' }}>Merge Nodes</span>
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
            {parentNodeNames && parentNodeNames.length > 0 && (
              <div className="flex items-center gap-2 mb-4 text-[10px] flex-wrap">
                {parentNodeNames.length <= 2 ? (
                  // Show all names if 2 or fewer
                  parentNodeNames.map((name, i) => (
                    <React.Fragment key={i}>
                      <span className="px-2 py-1 bg-white/5 border border-white/10 rounded-none truncate max-w-[100px]" style={{ color: '#b9c0cc' }} title={name}>
                        {name}
                      </span>
                      {i < parentNodeNames.length - 1 && <span className="text-slate-500">+</span>}
                    </React.Fragment>
                  ))
                ) : (
                  // Summary view for many nodes
                  <span className="px-2 py-1 bg-white/5 border border-white/10 rounded-none w-full text-center" style={{ color: '#b9c0cc' }}>
                    Synthesizing {parentNodeNames.length} Nodes
                  </span>
                )}
              </div>
            )}

            {/* AI Suggestions */}
            {node.pendingMerge?.isLoadingSuggestions ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <div className="w-2 h-2 bg-emerald-500/40 rounded-none animate-pulse" />
                <span className="text-[11px]" style={{ color: '#b9c0cc', opacity: 0.6 }}>Generating suggestions...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mb-4">
                {node.pendingMerge?.suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onMouseDown={(e) => { e.stopPropagation(); onMergeSelect?.(suggestion); }}
                    className="px-3 py-2 bg-[#1a1f26] hover:bg-[#252a31] border border-[#252a31] hover:border-[#3a414a] rounded-none text-[11px] transition-colors"
                    style={{ color: '#b9c0cc' }}
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
                  className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-none text-[11px] placeholder-slate-600 outline-none focus:border-emerald-500/30"
                  style={{ color: '#b9c0cc' }}
                />
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (mergeQuery.trim()) onMergeSelect?.(mergeQuery);
                  }}
                  disabled={!mergeQuery.trim()}
                  className="p-2 bg-orange-500 text-black rounded-none hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  style={{ color: '#e6eaf0' }}
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
                  {/* Edit Button */}
                  {!node.isQueryNode && (
                    <button
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setIsEditing(!isEditing);
                        if (!isEditing) onFocusRequest?.();
                      }}
                      className={`p-1 rounded transition-all ${isEditing
                        ? 'opacity-100 text-orange-400 bg-orange-500/10'
                        : 'opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white hover:bg-white/10'
                        }`}
                      title="Edit node"
                    >
                      <Pen className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {/* Attachment Button */}
                  <button
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleFileClick();
                    }}
                    className="p-1 rounded transition-all opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white hover:bg-white/10"
                    title="Attach file"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {/* Select Checkbox */}
                  <button
                    onMouseDown={(e) => { e.stopPropagation(); onToggleSelect(); }}
                    className={`w-5 h-5 rounded-none border transition-all flex items-center justify-center ${isSelected
                      ? 'opacity-100 bg-orange-500 border-orange-500'
                      : 'opacity-0 group-hover:opacity-100 border-slate-600 hover:border-slate-500'
                      }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-black" />}
                  </button>
                </div>
              </div>

              {/* Content Area: Markdown View or Textarea Edit */}
              <div
                className="relative group/content min-h-[60px] cursor-text"
                onMouseDown={(e) => {
                  if (!isEditing) {
                    e.stopPropagation();
                    // We no longer setIsEditing(true) here to allow selection
                  }
                }}
                onClick={(e) => {
                  if (!isEditing) {
                    // Editing is now only triggered via the Pen icon
                  }
                }}
              >
                {isEditing ? (
                  <textarea
                    ref={textareaRef}
                    value={displayText}
                    onChange={(e) => {
                      const newContent = e.target.value;
                      setDisplayText(newContent);
                      onUpdate?.(newContent);
                    }}
                    onBlur={() => setIsEditing(false)}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-full bg-transparent border-none outline-none resize-none text-[12px] leading-relaxed font-light overflow-hidden p-0 m-0 focus:ring-0 select-text"
                    style={{ color: '#b9c0cc' }}
                    spellCheck={false}
                    placeholder="Enter node content..."
                  />
                ) : (
                  <div
                    ref={contentRef}
                    className="prose prose-invert prose-sm max-w-none markdown-content select-text relative"
                    onMouseDown={handleContentMouseDown}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleContentMouseLeave}
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                  >
                    {node.isLoading && (
                      <div className="flex items-center gap-3 py-2 px-1 mb-2 bg-slate-500/5 border-l-2 border-slate-500/20">
                        <div className="loading-waveform">
                          <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                          <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                          <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                          <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                          <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                        </div>
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500/60 animate-pulse">Analyzing...</span>
                      </div>
                    )}
                    {renderedContent}
                  </div>
                )}
              </div>
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
                    <div className="flex flex-col items-center justify-center py-6 gap-3 bg-black/20 rounded-none border border-white/5">
                      <div className="loading-waveform">
                        <div className="waveform-bar" />
                        <div className="waveform-bar" />
                        <div className="waveform-bar" />
                        <div className="waveform-bar" />
                        <div className="waveform-bar" />
                      </div>
                      <span className="text-[10px] uppercase tracking-widest font-bold animate-pulse" style={{ color: '#e6eaf0' }}>Brainstorming Node</span>
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
                            className="px-3 py-2 rounded-none text-[10px] transition-colors border text-left font-medium"
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
                          className="flex-1 px-3 py-2 bg-black/30 border rounded-none text-[11px] text-white placeholder-slate-400 outline-none focus:border-opacity-50"
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
                          className="p-2 rounded-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                    className="px-3 py-1.5 rounded-none text-[9px] font-medium uppercase tracking-[0.12em] transition-all opacity-0 group-hover:opacity-70 hover:opacity-100 hover:bg-white/5 flex items-center gap-1.5 border border-white/10"
                    style={{
                      color: 'var(--node-text)'
                    }}
                  >
                    Expand
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Connection Points on all 4 sides */}
      {
        onEdgeDragStart && (
          <>
            <ConnectionPoint direction="top" className="-top-2.5 left-1/2 -translate-x-1/2" />
            <ConnectionPoint direction="bottom" className="-bottom-2.5 left-1/2 -translate-x-1/2" />
            <ConnectionPoint direction="left" className="top-1/2 -left-2.5 -translate-y-1/2" />
            <ConnectionPoint direction="right" className="top-1/2 -right-2.5 -translate-y-1/2" />
          </>
        )
      }

      {/* Invisible resize zones around the perimeter - cursor changes on hover */}
      {
        onResizeStart && (
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
        )
      }
      {/* Selection Tooltip */}
      {
        selectionData && (
          <div
            ref={tooltipRef}
            className="selection-tooltip absolute z-[100] pointer-events-auto transition-all duration-200"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              left: selectionData.x,
              top: selectionData.y,
              transform: selectionData.showBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)'
            }}
          >
            {!selectionData.isSearchExpanded ? (
              // Initial Tooltip - Premium High-Contrast Theme
              <div
                className="flex items-center gap-1 p-1.5 bg-[#0a0c10] border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(251,146,60,0.1)] rounded-none animate-in fade-in zoom-in duration-200"
                onMouseDown={(e) => e.preventDefault()} // CRITICAL: Prevent focus change to keep selection
              >
                <button
                  onClick={() => {
                    onSummarizeSelection?.(selectionData.text);
                    setSelectionData(null);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-orange-400/80" />
                  Summarize
                </button>
                <div className="w-px h-5 bg-white/10" />
                <button
                  onClick={() => {
                    onExpandSelection?.(selectionData.text);
                    setSelectionData(null);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-orange-400/80" />
                  Expand
                </button>
                <div className="w-px h-5 bg-white/10" />
                <button
                  onClick={() => {
                    onExtensionRequest?.(selectionData.text);
                    setSelectionData(null);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="px-2 py-1.5 text-slate-400 hover:text-orange-400 transition-colors"
                  title="Further search"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            ) : null}
          </div>
        )
      }
    </div >
  );
};

export default GraphNode;
