
import React from 'react';
import { Node as NodeType } from './types';
import { Sparkles, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface NodeProps {
    node: NodeType;
    scrollProgress: number;
}

const Node: React.FC<NodeProps> = ({ node, scrollProgress }) => {
    const isVisible = scrollProgress >= node.visibleAt;
    const opacity = Math.min(1, Math.max(0, (scrollProgress - node.visibleAt) * 25));
    // Parallax effect
    const translateY = Math.max(0, (node.visibleAt + 0.015 - scrollProgress) * 5);

    // Map legacy colors to graph-node-* classes
    const getColorClass = (color: string) => {
        switch (color) {
            case 'emerald': return 'graph-node-green';
            case 'sky': return 'graph-node-blue';
            case 'amber': return 'graph-node-yellow';
            case 'slate': return 'graph-node-slate';
            case 'orange': return 'graph-node-orange';
            default: return 'graph-node-slate';
        }
    };

    const colorClass = getColorClass(node.color);

    // Expansion Sequence Logic
    const hasExpansion = !!node.expansion;
    // The panel is active ONLY between triggerAt and brainstormEndAt
    const expansionActive = hasExpansion &&
        scrollProgress >= node.expansion!.triggerAt &&
        scrollProgress < node.expansion!.brainstormEndAt;

    const isLoading = hasExpansion && scrollProgress >= node.expansion!.loadingAt && scrollProgress < node.expansion!.optionsAt;
    const showOptions = hasExpansion && scrollProgress >= node.expansion!.optionsAt && scrollProgress < node.expansion!.brainstormAt;
    const showBrainstorm = hasExpansion && scrollProgress >= node.expansion!.brainstormAt && scrollProgress < node.expansion!.brainstormEndAt;

    if (!isVisible) return null;

    return (
        <div
            className={`absolute w-60 select-none flex flex-col ${colorClass}`}
            style={{
                left: `${node.position.x}%`,
                top: `${node.position.y + translateY}%`,
                transform: `translate(-50%, 0) scale(${showBrainstorm ? 1.1 : 1})`,
                opacity: opacity,
                zIndex: expansionActive ? 20 : 10,
                transition: 'box-shadow 0.2s ease, transform 0.2s ease, top 0.05s linear',
            }}
        >
            {/* Connector Pins - Moved outside to specific overflow clipping */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#141b19] border border-white/10 rounded-full flex items-center justify-center text-[10px] z-10 shadow-md transform transition-transform hover:scale-110" style={{ color: 'var(--node-accent)', borderColor: 'var(--node-border)' }}>+</div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-4 bg-[#141b19] border border-white/10 rounded-full flex items-center justify-center text-[10px] z-10 shadow-md transform transition-transform hover:scale-110" style={{ color: 'var(--node-accent)', borderColor: 'var(--node-border)' }}>+</div>
            <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#141b19] border border-white/10 rounded-full flex items-center justify-center text-[10px] z-10 shadow-md transform transition-transform hover:scale-110" style={{ color: 'var(--node-accent)', borderColor: 'var(--node-border)' }}>+</div>
            <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#141b19] border border-white/10 rounded-full flex items-center justify-center text-[10px] z-10 shadow-md transform transition-transform hover:scale-110" style={{ color: 'var(--node-accent)', borderColor: 'var(--node-border)' }}>+</div>

            <div
                className="rounded-2xl overflow-hidden flex flex-col h-full backdrop-blur-xl transition-all duration-700 ease-out"
                style={{
                    background: 'var(--node-bg)',
                    border: '1px solid var(--node-border)',
                    boxShadow: expansionActive ? '0 20px 50px -10px rgba(0,0,0,0.5)' : undefined
                }}
            >
                {/* Color Header Bar */}
                <div
                    className="h-1 shrink-0"
                    style={{ background: 'var(--node-header)' }}
                />

                {/* Content Area */}
                <div className="p-4 flex flex-col h-full">
                    {/* Title Row */}
                    <div className="flex items-start justify-between mb-3 gap-3">
                        <h3
                            className="font-semibold text-[13px] leading-snug"
                            style={{ color: 'var(--node-text)' }}
                        >
                            {node.title}
                        </h3>
                    </div>

                    {/* Content Points */}
                    <ul className="space-y-2 mb-3">
                        {node.content.map((point, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <div
                                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 opacity-60"
                                    style={{ background: 'var(--node-accent)' }}
                                />
                                <span
                                    className="text-[11px] leading-relaxed font-light"
                                    style={{ color: 'var(--node-text)', opacity: 0.8 }}
                                >
                                    {point}
                                </span>
                            </li>
                        ))}
                    </ul>

                    {/* Expand button - Show for all nodes (static for non-expanding ones) */}
                    {!expansionActive && (!hasExpansion || scrollProgress < node.expansion!.triggerAt) && (
                        <div className="flex justify-end mt-auto pt-2">
                            <button
                                className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-[0.12em] transition-all flex items-center gap-1.5 hover:brightness-125"
                                style={{
                                    background: 'var(--node-header)',
                                    color: 'var(--node-text)' // Use text color for contrast or black if header is light?
                                    // GraphNode uses specific styling. The var(--node-header) is usually a color with opacity.
                                    // Let's use a specific style mimicking the main app "Expand" button which is usually an icon or a pill.
                                }}
                            >
                                <Sparkles className="w-3 h-3" />
                                Expand
                            </button>
                        </div>
                    )}
                </div>

                {/* Expansion Area */}
                <div
                    className={`border-t bg-black/20 overflow-hidden transition-all duration-700 ease-in-out ${expansionActive ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}
                    style={{ borderColor: 'var(--node-border)' }}
                >
                    <div className="p-3 space-y-2.5">
                        {/* Header Row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--node-accent)' }} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--node-accent)' }}>
                                    EXPANSION OPTIONS
                                </span>
                                {isLoading && (
                                    <div className="w-3 h-3 border-2 rounded-full animate-spin ml-1" style={{ borderColor: 'var(--node-border)', borderTopColor: 'var(--node-accent)' }}></div>
                                )}
                            </div>
                            {/* Visual Close Icon */}
                            <div className="text-white/20">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </div>
                        </div>

                        <AnimatePresence mode="wait">
                            {/* Loading Text */}
                            {isLoading && (
                                <motion.div
                                    key="loading"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="pb-2"
                                >
                                    <p className="text-[11px] italic font-medium tracking-tight opacity-60" style={{ color: 'var(--node-text)' }}>
                                        Finding best ways to expand...
                                    </p>
                                </motion.div>
                            )}

                            {/* Options List - Only show if NOT brainstorming yet */}
                            {showOptions && !showBrainstorm && (
                                <motion.div
                                    key="options"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.4 }}
                                    className="space-y-2 pt-1"
                                >
                                    {node.expansion!.options.map((opt, i) => (
                                        <div key={i} className="p-3 rounded-xl transition-all cursor-pointer group hover:bg-white/5 border border-transparent hover:border-white/10"
                                            style={{ background: 'var(--node-bg)' }}>
                                            <p className="text-[11px] font-medium leading-tight group-hover:text-white" style={{ color: 'var(--node-text)' }}>
                                                {opt}
                                            </p>
                                        </div>
                                    ))}
                                    {/* Input Field */}
                                    <div className="relative mt-4">
                                        <input
                                            type="text"
                                            placeholder="Or type custom query..."
                                            className="w-full bg-black/30 border rounded-xl px-4 py-2.5 text-[11px] text-slate-400 focus:outline-none"
                                            style={{ borderColor: 'var(--node-border)' }}
                                            readOnly
                                        />
                                        <div className="absolute right-2 top-1 bottom-1 w-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--node-bg)', color: 'var(--node-accent)' }}>
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Brainstorming Box - Discrete view matching Image 2 */}
                            {showBrainstorm && (
                                <motion.div
                                    key="brainstorm"
                                    initial={{ opacity: 0, scale: 0.95, height: 0 }}
                                    animate={{ opacity: 1, scale: 1, height: 'auto' }}
                                    exit={{ opacity: 0, scale: 0.95, height: 0 }}
                                    transition={{ duration: 0.5 }}
                                    className="mt-2 text-center"
                                >
                                    <div className="bg-[#050a08]/80 border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center gap-2.5 shadow-inner">
                                        <div className="loading-waveform scale-90">
                                            <div className="waveform-bar"></div>
                                            <div className="waveform-bar"></div>
                                            <div className="waveform-bar"></div>
                                            <div className="waveform-bar"></div>
                                            <div className="waveform-bar"></div>
                                        </div>
                                        <span className="text-[8px] font-bold uppercase tracking-[0.2em] opacity-50" style={{ color: 'var(--node-text)' }}>
                                            Brainstorming Node
                                        </span>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Node;
