
import React from 'react';
import { motion } from 'framer-motion';
import { Database, FileText, Cpu, Download } from 'lucide-react';

interface LandingSidebarProps {
    scrollProgress: number; // 0 to 1 for the whole intro
}

const LandingSidebar: React.FC<LandingSidebarProps> = ({ scrollProgress }) => {
    // 0.00 - 0.05: Sidebar Slide-in
    const sidebarX = scrollProgress < 0.05
        ? -256 + (scrollProgress / 0.05) * 256
        : 0;

    // 0.45 - 0.50: Sidebar Fade-out/Slide-out during morph
    const opacity = scrollProgress > 0.45
        ? Math.max(0, 1 - (scrollProgress - 0.45) / 0.05)
        : 1;

    const docs = [
        { id: '1', name: 'Interogo_Holding_AG_Annual_Report_2020.pdf', size: '5516 KB' },
        { id: '2', name: 'Interogo_Holding_AG_Annual_Report_2021.pdf', size: '2521 KB' },
        { id: '3', name: 'Interogo_Holding_AG_Annual_Report_2022.pdf', size: '1519 KB' },
        { id: '4', name: 'Strategic_Outlook_2023_v2.md', size: '1380 KB' },
        { id: '5', name: 'Operational_Efficiencies_Deep_Dive.txt', size: '1304 KB' },
        { id: '6', name: 'Sustainability_Metrics_Final.pdf', size: '942 KB' },
        { id: '7', name: 'Digital_Transformation_Roadmap.pdf', size: '2105 KB' }
    ];

    return (
        <motion.aside
            className="fixed left-0 top-0 bottom-0 w-64 glass-surface border-r border-emerald-500/10 z-[60] flex flex-col pointer-events-none"
            style={{
                x: sidebarX,
                opacity: opacity
            }}
        >
            {/* Header */}
            <div className="p-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2 mb-3">
                    <Database className="w-3 h-3 text-emerald-500/70" />
                    <h2 className="text-[8px] font-bold text-emerald-500/70 uppercase tracking-[0.2em]">Reservoir</h2>
                </div>

                <div className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-white/10 rounded-xl">
                    <Download className="w-4 h-4 text-slate-600 mb-1 rotate-180" />
                    <span className="text-[9px] font-medium text-slate-500">Ingest Documents</span>
                    <span className="text-[7px] text-slate-600 mt-0.5">.txt, .md, .pdf</span>
                </div>
            </div>

            {/* Document List */}
            <div className="flex-1 p-2 space-y-1 overflow-hidden">
                <div className="flex items-center justify-between px-2 mb-1.5">
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                        Documents (7)
                    </span>
                </div>

                {docs.map((doc, i) => {
                    // Staggered population: 0.05 + i * 0.01
                    const startAt = 0.05 + i * 0.015;
                    const endAt = startAt + 0.01;
                    const docVisible = scrollProgress >= startAt;
                    const docOpacity = Math.min(1, Math.max(0, (scrollProgress - startAt) / (endAt - startAt)));
                    const docY = (1 - docOpacity) * 8;

                    return (
                        <div
                            key={doc.id}
                            className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.01] border border-white/[0.04]"
                            style={{
                                opacity: docOpacity,
                                transform: `translateY(${docY}px)`
                            }}
                        >
                            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500/60 shrink-0">
                                <FileText className="w-3 h-3" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-medium text-slate-300 truncate">{doc.name}</p>
                                <p className="text-[8px] text-slate-600 uppercase font-bold tracking-wide">{doc.size}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Status Footer */}
            <div className="p-2 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <Cpu className="w-2.5 h-2.5 text-emerald-500/60" />
                    AI Engine Ready
                </div>
            </div>
        </motion.aside>
    );
};

export default LandingSidebar;
