
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight, FileText, Check } from 'lucide-react';

interface LandingSearchBarProps {
    scrollProgress: number;
}

const LandingSearchBar: React.FC<LandingSearchBarProps> = ({ scrollProgress }) => {
    // 0.12 - 0.16: Fade in and Scale down (Zoom to normal)
    const arrivalStart = 0.12;
    const arrivalEnd = 0.16;
    const arrivalProgress = Math.min(1, Math.max(0, (scrollProgress - arrivalStart) / (arrivalEnd - arrivalStart)));

    // Scale from 1.2 to 1.0, Opacity 0 to 1
    const scale = 1.2 - arrivalProgress * 0.2;
    const arrivalOpacity = arrivalProgress;

    // Phase: Typing @ Interogo 2020 (Pill 1)
    // 0.16 - 0.22: Interaction 1
    const p1Start = 0.16;
    const p1TypeAtAt = 0.17;
    const p1DropdownAt = 0.175;
    const p1SelectAt = 0.20;
    const p1PillAt = 0.21;

    // Phase: Typing @ Interogo 2021 (Pill 2)
    const p2Start = 0.22;
    const p2TypeAtAt = 0.23;
    const p2DropdownAt = 0.235;
    const p2SelectAt = 0.26;
    const p2PillAt = 0.27;

    // Phase: Typing @ Interogo 2022 (Pill 3)
    const p3Start = 0.28;
    const p3TypeAtAt = 0.29;
    const p3DropdownAt = 0.295;
    const p3SelectAt = 0.32;
    const p3PillAt = 0.33;

    // Phase: Final Query typing
    const queryStart = 0.34;
    const queryEnd = 0.45;
    const queryTarget = "what actually changed over the last 3 years";

    // Morph Phase
    const morphStart = 0.45;
    const morphEnd = 0.50;
    const morphProgress = Math.min(1, Math.max(0, (scrollProgress - morphStart) / (morphEnd - morphStart)));

    // Visibility
    if (scrollProgress < arrivalStart) return null;
    if (scrollProgress > morphEnd + 0.05) return null; // Fully handed over to Root Node

    // Computed Interaction States
    const showPill1 = scrollProgress >= p1PillAt;
    const showPill2 = scrollProgress >= p2PillAt;
    const showPill3 = scrollProgress >= p3PillAt;

    const showAt1 = scrollProgress >= p1TypeAtAt && !showPill1;
    const showAt2 = scrollProgress >= p2TypeAtAt && !showPill2;
    const showAt3 = scrollProgress >= p3TypeAtAt && !showPill3;

    const showDropdown1 = scrollProgress >= p1DropdownAt && !showPill1;
    const showDropdown2 = scrollProgress >= p2DropdownAt && !showPill2;
    const showDropdown3 = scrollProgress >= p3DropdownAt && !showPill3;

    const isSelecting1 = scrollProgress >= p1SelectAt && !showPill1;
    const isSelecting2 = scrollProgress >= p2SelectAt && !showPill2;
    const isSelecting3 = scrollProgress >= p3SelectAt && !showPill3;

    // Typewriter effect for final query
    const typedLength = Math.floor(Math.min(1, Math.max(0, (scrollProgress - queryStart) / (queryEnd - queryStart))) * queryTarget.length);
    const displayedQuery = queryTarget.slice(0, typedLength);

    const dropdownDocs = [
        { name: 'Interogo_Holding_AG_Annual_Report_2020.pdf', size: '2521 KB' },
        { name: 'Interogo_Holding_AG_Annual_Report_2021.pdf', size: '1519 KB' },
        { name: 'Interogo_Holding_AG_Annual_Report_2022.pdf', size: '5516 KB' },
    ];

    // Morph Logic
    // During morph, the search bar container expands or shrinks to match the root node.
    // Root Node is at y: 15%. Search bar is roughly in the center.
    const containerWidth = 560 - morphProgress * (560 - 240); // 240 is w-60 (Reduced node width)
    const containerHeight = 64 - morphProgress * (64 - 140); // Node height is larger
    const translateY = -50 - morphProgress * 10; // Slight upward movement to match root node position
    const containerOpacity = 1 - Math.max(0, (morphProgress - 0.8) * 5); // Fade out at the very end of morph to show the real Node

    return (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-[70]">
            <motion.div
                className="relative flex flex-col items-center"
                style={{
                    scale,
                    opacity: arrivalOpacity * containerOpacity,
                    y: `${translateY}%`
                }}
            >
                {/* Search Bar Container */}
                <div
                    className="glass-surface rounded-2xl border border-emerald-500/20 px-4 py-3 flex items-center gap-3 transition-all duration-300"
                    style={{
                        width: containerWidth,
                        minHeight: 64,
                        borderColor: morphProgress > 0.5 ? 'rgba(100, 116, 139, 0.3)' : 'rgba(16, 185, 129, 0.2)'
                    }}
                >
                    <Search className={`w-4 h-4 shrink-0 transition-colors ${morphProgress > 0.5 ? 'text-slate-500' : 'text-emerald-500/50'}`} />

                    <div className="flex-1 flex flex-wrap gap-1.5 items-center min-w-0">
                        {/* Pills */}
                        <AnimatePresence>
                            {showPill1 && (
                                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 font-medium">
                                    <FileText className="w-2.5 h-2.5" />
                                    <span className="truncate max-w-[100px]">Interogo_2020.pdf</span>
                                </motion.div>
                            )}
                            {showPill2 && (
                                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 font-medium">
                                    <FileText className="w-2.5 h-2.5" />
                                    <span className="truncate max-w-[100px]">Interogo_2021.pdf</span>
                                </motion.div>
                            )}
                            {showPill3 && (
                                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 font-medium">
                                    <FileText className="w-2.5 h-2.5" />
                                    <span className="truncate max-w-[100px]">Interogo_2022.pdf</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Input Area */}
                        <div className="flex-1 flex items-center relative gap-1 min-w-[150px]">
                            {(showAt1 || showAt2 || showAt3) && (
                                <span className="text-emerald-400 font-mono text-xs">@</span>
                            )}
                            <span className={`text-xs tracking-tight ${morphProgress > 0.5 ? 'text-slate-300 font-semibold' : 'text-zinc-300'}`}>
                                {displayedQuery}
                                {scrollProgress < queryEnd && scrollProgress > arrivalEnd && (
                                    <span className="animate-pulse text-emerald-500 ml-0.5">|</span>
                                )}
                            </span>
                            {displayedQuery === "" && !showAt1 && !showAt2 && !showAt3 && (
                                <span className="text-xs text-zinc-600">Ask a question...</span>
                            )}
                        </div>
                    </div>

                    {/* Search Button */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${morphProgress > 0.5 ? 'bg-slate-500/20 text-slate-500' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                </div>

                {/* Dropdown Menu */}
                <AnimatePresence>
                    {(showDropdown1 || showDropdown2 || showDropdown3) && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute top-full mt-2 left-0 w-64 glass-surface border border-emerald-500/20 rounded-xl overflow-hidden shadow-2xl z-20"
                        >
                            <div className="px-3 py-1.5 bg-white/[0.03] border-b border-white/[0.06]">
                                <span className="text-[8px] font-bold text-emerald-500/60 uppercase tracking-[0.15em]">Reference Documents</span>
                            </div>
                            <div className="p-1">
                                {dropdownDocs.map((doc, i) => {
                                    const isActive = (showDropdown1 && i === 0) || (showDropdown2 && i === 1) || (showDropdown3 && i === 2);
                                    const isSelected = (showDropdown1 && isSelecting1 && i === 0) ||
                                        (showDropdown2 && isSelecting2 && i === 1) ||
                                        (showDropdown3 && isSelecting3 && i === 2);

                                    return (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${isActive ? 'bg-white/5' : ''}`}
                                        >
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isActive ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/5 text-slate-500'}`}>
                                                <FileText className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-[11px] font-medium truncate ${isActive ? 'text-emerald-400' : 'text-slate-400'}`}>{doc.name}</p>
                                                <p className="text-[8px] text-slate-600 font-bold tracking-wide uppercase">{doc.size}</p>
                                            </div>
                                            {isSelected && (
                                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                </motion.div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};

export default LandingSearchBar;
