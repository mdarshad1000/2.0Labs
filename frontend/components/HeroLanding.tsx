import React, { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion';
import {
  Database,
  FileText,
  Sparkles,
  ArrowRight,
  MessageSquare,
  ChevronDown,
  LogIn,
  LogOut,
  User
} from 'lucide-react';
import { DEMO_DATA } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import GraphAnimation from './landing-graph/GraphAnimation';

interface HeroLandingProps {
  onProceed: () => void;
  onLogin?: () => void;
}

// Scroll-synchronized streaming text component
const ScrollStreamingText: React.FC<{
  text: string;
  progress: number; // 0 to 1, how much of the text to show
  showCursor?: boolean;
}> = ({ text, progress, showCursor = true }) => {
  const charCount = Math.floor(text.length * Math.min(1, Math.max(0, progress)));
  const displayedText = text.slice(0, charCount);
  const isComplete = charCount >= text.length;

  return (
    <span>
      {displayedText}
      {!isComplete && showCursor && <span className="animate-pulse text-emerald-400">|</span>}
    </span>
  );
};

// Loading cell animation (signal assembly style)
const LoadingCell: React.FC = () => (
  <div className="signal-assembly">
    <div className="signal-segment"></div>
    <div className="signal-segment"></div>
    <div className="signal-segment"></div>
    <div className="signal-segment"></div>
  </div>
);

const HeroLanding: React.FC<HeroLandingProps> = ({ onProceed, onLogin }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Enable scrolling on body for this page
  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.body.style.overflowX = 'hidden';
    return () => {
      document.body.style.overflow = 'hidden';
    };
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // Track scroll progress for conditional rendering
  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    setScrollProgress(latest);
  });

  // --- SEQUENCE TIMING CONSTANTS ---
  // The page is now much taller (1600vh).
  // 0.00 - 0.12: Hero Text fades out
  // 0.08 - 0.40: Graph Animation plays
  // 0.40 - 0.45: Transition
  // 0.45 - 1.00: Matrix Animation plays (remapped from original 0.08-1.0)

  const MATRIX_START = 0.82;
  const GRAPH_START = 0.08;
  const GRAPH_END = 0.82;

  // DERIVED PROGRESS VALUES
  // matrixProgress: 0 to 1 representing the progress WITHIN the matrix section
  const matrixMotionProgress = useTransform(scrollYProgress, [MATRIX_START, 1], [0, 1]);

  // Calculate effective progress for logic checks (state-based)
  const matrixEffectiveProgress = Math.max(0, (scrollProgress - MATRIX_START) / (1 - MATRIX_START));
  // Decoupled animation progress: Animation + Intro + Graph
  // Animation completes by scroll 0.72 (0.08 + 0.64 * 1.0)
  const graphEffectiveProgress = Math.min(1, Math.max(0, (scrollProgress - GRAPH_START) / 0.64));

  // --- 1. HERO TEXT SECTION ---
  // Fades up and shrinks early on
  const heroOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.12], [0, -100]);
  const heroScale = useTransform(scrollYProgress, [0, 0.12], [1, 0.9]);

  // Scroll indicator
  const scrollIndicatorOpacity = useTransform(scrollYProgress, [0, 0.06], [1, 0]);

  // --- 2. GRAPH ANIMATION SECTION ---
  // Appears after/as text fades, fades out before Matrix
  // Static window from 0.72 to 0.77
  const graphOpacity = useTransform(scrollYProgress, [GRAPH_START, GRAPH_START + 0.05, 0.77, GRAPH_END], [0, 1, 1, 0]);
  const graphScale = useTransform(scrollYProgress, [GRAPH_START, GRAPH_END], [0.85, 0.95]); // Miniature zoom
  const graphVisible = scrollProgress > GRAPH_START - 0.02 && scrollProgress < GRAPH_END + 0.02;

  // --- 3. MATRIX ANIMATION SECTION ---
  // Using matrixMotionProgress for everything here to "virtualize" the scroll

  // Matrix container - appears and stays fixed
  const matrixOpacity = useTransform(matrixMotionProgress, [0.08, 0.15], [0, 1]);
  const matrixY = useTransform(matrixMotionProgress, [0.08, 0.15], [60, 0]);

  // Sidebar slides in from left
  const sidebarX = useTransform(matrixMotionProgress, [0.15, 0.25], [-300, 0]);
  const sidebarOpacity = useTransform(matrixMotionProgress, [0.15, 0.22], [0, 1]);

  // Matrix takes remaining space, shrinks when chat appears (delayed)
  const matrixMarginRight = useTransform(matrixMotionProgress, [0.60, 0.74], [0, 380]);

  // Cell loading states (loading animation -> value)
  // Logic uses matrixEffectiveProgress now
  const row1Loading = matrixEffectiveProgress >= 0.18 && matrixEffectiveProgress < 0.25;
  const row1Value = matrixEffectiveProgress >= 0.25;

  const row2Loading = matrixEffectiveProgress >= 0.22 && matrixEffectiveProgress < 0.29;
  const row2Value = matrixEffectiveProgress >= 0.29;

  const row3Loading = matrixEffectiveProgress >= 0.26 && matrixEffectiveProgress < 0.33;
  const row3Value = matrixEffectiveProgress >= 0.33;

  const row4Loading = matrixEffectiveProgress >= 0.30 && matrixEffectiveProgress < 0.37;
  const row4Value = matrixEffectiveProgress >= 0.37;

  const row5Loading = matrixEffectiveProgress >= 0.34 && matrixEffectiveProgress < 0.41;
  const row5Value = matrixEffectiveProgress >= 0.41;

  const row6Loading = matrixEffectiveProgress >= 0.38 && matrixEffectiveProgress < 0.45;
  const row6Value = matrixEffectiveProgress >= 0.45;

  // Cell expansion modal
  const cellExpansionVisible = matrixEffectiveProgress >= 0.46 && matrixEffectiveProgress < 0.60;
  const cellExpansionOpacity = useTransform(matrixMotionProgress, [0.46, 0.48, 0.56, 0.60], [0, 1, 1, 0]);

  // Taglines
  const matrixTaglineOpacity = useTransform(matrixMotionProgress, [0.25, 0.32, 0.44, 0.47], [0, 1, 1, 0]);
  const cellExpandTaglineOpacity = useTransform(matrixMotionProgress, [0.47, 0.50, 0.58, 0.62], [0, 1, 1, 0]);
  const chatTaglineOpacity = useTransform(matrixMotionProgress, [0.66, 0.72, 0.85, 0.90], [0, 1, 1, 0]);

  // Chat panel slides in from right
  const chatX = useTransform(matrixMotionProgress, [0.60, 0.74], [380, 0]);
  const chatOpacity = useTransform(matrixMotionProgress, [0.60, 0.68], [0, 1]);

  // Chat icon
  const chatIconOpacity = useTransform(matrixMotionProgress, [0.54, 0.58, 0.60], [0, 1, 0]);

  // Demo container fades out for CTA reveal
  const demoFadeOut = useTransform(matrixMotionProgress, [0.88, 0.94], [1, 0]);
  const demoSlideUp = useTransform(matrixMotionProgress, [0.88, 0.94], [0, -100]);

  // CTA button
  const ctaOpacity = useTransform(matrixMotionProgress, [0.93, 0.98], [0, 1]);
  const ctaScale = useTransform(matrixMotionProgress, [0.93, 0.98], [0.9, 1]);

  // Helper to get cell state
  const getCellState = (rowIndex: number): 'hidden' | 'loading' | 'value' => {
    switch (rowIndex) {
      case 0:
        if (row1Value) return 'value';
        if (row1Loading) return 'loading';
        break;
      case 1:
        if (row2Value) return 'value';
        if (row2Loading) return 'loading';
        break;
      case 2:
        if (row3Value) return 'value';
        if (row3Loading) return 'loading';
        break;
      case 3:
        if (row4Value) return 'value';
        if (row4Loading) return 'loading';
        break;
      case 4:
        if (row5Value) return 'value';
        if (row5Loading) return 'loading';
        break;
      case 5:
        if (row6Value) return 'value';
        if (row6Loading) return 'loading';
        break;
    }
    return 'hidden';
  };

  return (
    <div
      ref={containerRef}
      className="relative bg-[#030a06]"
      style={{ height: '2000vh' }} // Extended height for multi-stage animation
    >
      {/* Grain overlay */}
      <div className="landing-grain" aria-hidden="true" />

      {/* Fixed header with Sign In */}
      <div className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <Database className="text-black w-4 h-4" />
          </div>
          <span className="text-lg font-extralight tracking-tight text-white">
            2.0Labs<span className="text-emerald-500 opacity-60 italic">_</span>
          </span>
        </div>

        {user ? (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || 'User'}
                  className="w-5 h-5 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center ${user.picture ? 'hidden' : ''}`}>
                <User className="w-3 h-3 text-emerald-400" />
              </div>
              <span className="text-sm text-slate-300">{user.name || user.email}</span>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#020804]/98 backdrop-blur-xl border border-white/[0.06] rounded-lg shadow-xl overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-white/[0.05]">
                  <p className="text-sm text-white font-light truncate">{user.name || 'User'}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.03] transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onLogin}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-emerald-500/30 transition-all group"
          >
            <LogIn className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Sign In</span>
          </button>
        )}
      </div>

      {/* Fixed viewport container - everything stays in view */}
      <div className="fixed inset-0 overflow-hidden font-['Epilogue']">
        {/* Ambient gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% 30%, rgba(16, 185, 129, 0.04) 0%, transparent 60%)',
          }}
        />

        {/* Hero Section - Fades out as you scroll */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none"
          style={{ opacity: heroOpacity, y: heroY, scale: heroScale }}
        >
          <div className="text-center pointer-events-auto">
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.3)]">
                <Database className="text-black w-6 h-6" />
              </div>
              <h2 className="text-2xl font-extralight tracking-tighter text-white">
                2.0Labs<span className="text-emerald-500 opacity-60 italic">_</span>
              </h2>
            </div>

            <h1 className="text-4xl md:text-5xl font-extralight tracking-tight text-white mb-4">
              Structure is the difference
              <br />
              between <span className="text-emerald-400">data</span> and <span className="text-emerald-400">clarity</span>
            </h1>

            <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed mb-6">
              Upload your files. Extract insights. Ask questions with citations.
            </p>

            {/* Backed by Mohammed Arshad pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                <span className="text-white font-bold text-[10px]">M</span>
              </div>
              <span className="text-[10px] tracking-wide text-slate-300">
                Built by <span className="text-emerald-400 font-semibold">Mohammed Arshad</span>
              </span>
            </div>
          </div>
        </motion.div>

        {/* Scroll indicator - Initial only */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500 z-40"
          style={{ opacity: scrollIndicatorOpacity }}
        >
          <span className="text-[10px] uppercase tracking-[0.2em]">Scroll to explore</span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </motion.div>

        {/* --- GRAPH ANIMATION STAGE --- */}
        <motion.div
          className="absolute inset-0 z-20"
          style={{
            opacity: graphOpacity,
            scale: graphScale,
            pointerEvents: graphVisible ? 'auto' : 'none'
          }}
        >
          <GraphAnimation scrollProgress={graphEffectiveProgress} />
        </motion.div>

        {/* --- MATRIX DEMO STAGE --- */}
        {/* Only render/animate when matrix section has started to improve performance/logic */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center px-16 py-8"
          style={{
            opacity: matrixEffectiveProgress < 0.85 ? matrixOpacity : demoFadeOut,
            y: matrixEffectiveProgress < 0.85 ? matrixY : demoSlideUp
          }}
        >
          <div className="w-full max-w-[1400px] h-[75vh] flex gap-2 items-stretch relative mx-auto">

            {/* Left Sidebar - Documents */}
            <motion.div
              className="w-44 shrink-0"
              style={{ x: sidebarX, opacity: sidebarOpacity }}
            >
              <div className="glass-surface rounded-lg p-2.5 border border-emerald-500/10 h-full">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                  <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center">
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-sm font-light text-white block">2.0Labs<span className="text-emerald-500/60">_</span></span>
                    <span className="text-[9px] text-emerald-500 uppercase tracking-wider">What am I missing?</span>
                  </div>
                </div>

                <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-3 font-semibold">Nodes</p>
                <div className="space-y-2">
                  {DEMO_DATA.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-300 truncate">{doc.name.replace('.pdf', '').replace('.xlsx', '')}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <button className="w-full mt-4 py-3 border border-dashed border-white/10 rounded-lg text-[9px] text-slate-500 hover:text-emerald-400 hover:border-emerald-500/40 transition-all flex flex-col items-center justify-center gap-1.5 uppercase tracking-wider font-semibold">
                  <span className="text-lg">+</span>
                  Ingest
                </button>
              </div>
            </motion.div>

            {/* Main Matrix - fills available space, margin adjusts when chat appears */}
            <motion.div
              className="glass-surface rounded-xl border border-emerald-500/10 overflow-hidden flex-1 transition-all duration-100 ease-out"
              style={{ marginRight: matrixMarginRight }}
            >
              {/* Matrix Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#030a06]/80">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-semibold text-white uppercase tracking-wider">Synthesis Engine</span>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Database className="w-3 h-3" />
                    <span className="text-[10px]">{DEMO_DATA.documents.length} Entities</span>
                  </div>
                </div>
              </div>

              {/* Matrix Column Headers */}
              <div className="flex border-b border-white/[0.06] bg-[#030a06]/60">
                <div className="w-40 shrink-0 px-3 py-2 text-[8px] font-semibold text-slate-500 uppercase tracking-wider border-r border-white/[0.04]">
                  Entity
                </div>
                {DEMO_DATA.metrics.map((metric) => (
                  <div
                    key={metric.id}
                    className="flex-1 px-3 py-2 border-r border-white/[0.04] last:border-r-0 min-w-[100px]"
                  >
                    <p className="text-[9px] text-slate-300 font-medium truncate">{metric.label}</p>
                  </div>
                ))}
              </div>

              {/* Matrix Rows - with loading animation */}
              {DEMO_DATA.documents.map((doc, docIdx) => {
                const cellState = getCellState(docIdx);
                const cellData = DEMO_DATA.cells[doc.id];

                return (
                  <div
                    key={doc.id}
                    className="flex border-b border-white/[0.03] last:border-b-0"
                  >
                    <div className="w-40 shrink-0 px-3 py-2 border-r border-white/[0.04]">
                      <p className="text-[10px] text-slate-200 truncate">{doc.name.replace('.pdf', '').replace('.xlsx', '').replace('.csv', '')}</p>
                      <p className="text-[8px] text-slate-500 font-mono mt-0.5">{doc.shortId || doc.id}</p>
                    </div>
                    {DEMO_DATA.metrics.map((metric) => {
                      const cell = cellData?.[metric.id];
                      const isHighlighted = cellExpansionVisible && docIdx === 0 && metric.id === 'focus';
                      return (
                        <div
                          key={`${doc.id}-${metric.id}`}
                          className={`flex-1 px-3 py-2 border-r border-white/[0.04] last:border-r-0 min-w-[100px] transition-all duration-300 ${cellState === 'loading' ? 'bg-emerald-500/[0.02]' : ''
                            } ${isHighlighted ? 'bg-emerald-500/10 border border-emerald-500/30 rounded -m-px' : ''}`}
                        >
                          {cellState === 'hidden' && (
                            <span className="text-[9px] text-slate-700">—</span>
                          )}
                          {cellState === 'loading' && (
                            <LoadingCell />
                          )}
                          {cellState === 'value' && cell && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.3 }}
                            >
                              <div className="flex items-center gap-1 mb-0.5">
                                <div className={`w-1 h-1 rounded-full ${cell.confidence === 'High' ? 'bg-emerald-500' :
                                  cell.confidence === 'Medium' ? 'bg-amber-500' : 'bg-orange-500'
                                  }`} />
                                <span className="text-[7px] text-slate-500 uppercase">{cell.confidence}</span>
                              </div>
                              <p className="text-[10px] text-white font-mono truncate">{cell.value}</p>
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </motion.div>

            {/* Right Chat Panel - slides in from right edge */}
            <motion.div
              className="absolute right-0 top-0 bottom-0 w-[370px]"
              style={{ x: chatX, opacity: chatOpacity }}
            >
              <div className="glass-surface rounded-xl border border-emerald-500/10 overflow-hidden h-full flex flex-col">
                {/* Chat Header - matches actual app */}
                <div className="px-3 py-2.5 border-b border-white/[0.05] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-white uppercase tracking-wider">Analyst</p>
                      <p className="text-[8px] text-emerald-500/60 uppercase tracking-widest">Matrix-First</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded-md hover:bg-white/5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <button className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-md hover:bg-white/5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Chat Content */}
                <div className="flex-1 p-3 overflow-y-auto custom-scrollbar">
                  {/* Show loading state first, then conversation */}
                  {matrixEffectiveProgress >= 0.70 && matrixEffectiveProgress < 0.78 && (
                    <motion.div
                      className="flex items-center gap-2 text-emerald-500/70"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                      <span className="text-[10px] uppercase tracking-wider font-semibold">Analyzing...</span>
                    </motion.div>
                  )}

                  {/* User Question - scroll synchronized */}
                  {matrixEffectiveProgress >= 0.72 && (
                    <motion.div
                      className="mb-3"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="ml-6">
                        <div className="bg-emerald-500/8 border border-emerald-500/15 rounded-lg rounded-br-sm px-3 py-2.5">
                          <p className="text-[10px] text-slate-200">
                            <ScrollStreamingText
                              text={DEMO_DATA.chatDemo.question}
                              progress={(matrixEffectiveProgress - 0.72) / 0.03}
                            />
                          </p>
                        </div>
                        <p className="text-[8px] text-slate-600 mt-1 px-1.5">02:51</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Assistant Response with Citations - scroll synchronized */}
                  {matrixEffectiveProgress >= 0.78 && (
                    <motion.div
                      className="mr-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg rounded-bl-sm px-3 py-2.5">
                        <p className="text-[10px] text-slate-300 leading-relaxed">
                          <ScrollStreamingText
                            text="The burn rate for ACME Corp has been tracked across quarters. In Q4 2024, the burn rate was $890K/mo"
                            progress={(matrixEffectiveProgress - 0.78) / 0.04}
                            showCursor={matrixEffectiveProgress < 0.82}
                          />
                          {matrixEffectiveProgress >= 0.82 && (
                            <span className="inline-flex items-center justify-center min-w-[1rem] px-1 mx-0.5 bg-emerald-500/15 text-emerald-400 font-semibold rounded border border-emerald-500/25 text-[9px]">
                              1
                            </span>
                          )}
                          {matrixEffectiveProgress >= 0.82 && (
                            <ScrollStreamingText
                              text=". This increased from the previous quarter's $850K/mo"
                              progress={(matrixEffectiveProgress - 0.82) / 0.03}
                              showCursor={matrixEffectiveProgress < 0.85}
                            />
                          )}
                          {matrixEffectiveProgress >= 0.85 && (
                            <span className="inline-flex items-center justify-center min-w-[1rem] px-1 mx-0.5 bg-emerald-500/15 text-emerald-400 font-semibold rounded border border-emerald-500/25 text-[9px]">
                              2
                            </span>
                          )}
                          {matrixEffectiveProgress >= 0.85 && (
                            <ScrollStreamingText
                              text=", showing a 4.7% increase in monthly expenditure."
                              progress={(matrixEffectiveProgress - 0.85) / 0.03}
                              showCursor={matrixEffectiveProgress < 0.88}
                            />
                          )}
                        </p>

                        {/* References section */}
                        {matrixEffectiveProgress >= 0.88 && (
                          <motion.div
                            className="mt-3 pt-2.5 border-t border-white/[0.04]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <p className="text-[8px] text-slate-500 uppercase tracking-widest mb-2">References</p>
                            <div className="flex flex-wrap gap-1.5">
                              <button className="flex items-center gap-1 px-2 py-1 bg-white/[0.02] border border-white/[0.04] rounded text-[9px] text-slate-400 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                                [1]
                              </button>
                              <button className="flex items-center gap-1 px-2 py-1 bg-white/[0.02] border border-white/[0.04] rounded text-[9px] text-slate-400 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                                [2]
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </div>
                      <p className="text-[8px] text-slate-600 mt-1 px-1.5">02:51</p>
                    </motion.div>
                  )}
                </div>

                {/* Chat Input - matches actual app */}
                <div className="p-2.5 border-t border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-white/[0.02] border border-white/[0.04] rounded-md px-2.5 py-2">
                      <span className="text-[10px] text-slate-500 flex-1">Ask about your matrix...</span>
                    </div>
                    <button className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-[8px] text-emerald-500/50 mt-2 text-center font-mono">
                    6 docs • 24 cells
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Tagline for Matrix Population - positioned below interface */}
          <motion.div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center z-10"
            style={{ opacity: matrixTaglineOpacity }}
          >
            <p className="text-[10px] text-emerald-500/70 uppercase tracking-[0.25em] font-semibold">
              Synthesizing Intelligence
            </p>
            <p className="text-[9px] text-slate-600 mt-0.5">
              Extracting structured data from your documents
            </p>
          </motion.div>

          {/* Cell Expansion Modal - positioned near the Strategic Focus cell */}
          {cellExpansionVisible && (
            <motion.div
              className="absolute z-40"
              style={{
                opacity: cellExpansionOpacity,
                top: '100px',
                right: '60px'
              }}
            >
              <div className="glass-surface rounded-lg border border-emerald-500/20 p-3 w-[360px] shadow-[0_0_40px_rgba(16,185,129,0.15)]">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[9px] text-emerald-500 uppercase tracking-wider font-semibold">Strategic Focus</span>
                    <span className="text-[8px] text-slate-500 uppercase px-1 py-0.5 bg-white/5 rounded">High</span>
                  </div>
                  <button className="text-slate-500 hover:text-white p-0.5">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Value */}
                <p className="text-[11px] text-white font-mono mb-3">Growth, Market Expansion</p>

                {/* Reasoning section - unfolds as you scroll */}
                <div className="mb-3">
                  <div className="flex items-center gap-1 mb-2">
                    <motion.svg
                      className="w-2.5 h-2.5 text-emerald-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      animate={{ rotate: matrixEffectiveProgress >= 0.48 ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </motion.svg>
                    <span className="text-[8px] text-emerald-500 uppercase tracking-wider font-semibold">Reasoning</span>
                  </div>

                  {/* Reasoning content - appears progressively (extended timing) */}
                  {matrixEffectiveProgress >= 0.48 && (
                    <motion.div
                      className="pl-4 border-l border-emerald-500/20 space-y-1.5"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                    >
                      <p className="text-[9px] text-slate-300 leading-relaxed">
                        <ScrollStreamingText
                          text="Multiple data points indicate a strategic pivot toward international markets, with emphasis on enterprise customers."
                          progress={(matrixEffectiveProgress - 0.48) / 0.05}
                          showCursor={matrixEffectiveProgress < 0.53}
                        />
                      </p>
                      {matrixEffectiveProgress >= 0.52 && (
                        <motion.p
                          className="text-[9px] text-slate-400 leading-relaxed"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <ScrollStreamingText
                            text="Revenue projections assume 40% international contribution by Q4 2025."
                            progress={(matrixEffectiveProgress - 0.52) / 0.04}
                            showCursor={matrixEffectiveProgress < 0.56}
                          />
                        </motion.p>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* Sources - appear after reasoning (delayed) */}
                {matrixEffectiveProgress >= 0.54 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <p className="text-[8px] text-slate-500 uppercase tracking-wider mb-1.5 font-semibold">Sources</p>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-1.5 p-1.5 bg-white/[0.02] border border-white/[0.04] rounded">
                        <FileText className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                        <p className="text-[9px] text-slate-300 leading-relaxed">
                          The company is focused on aggressive growth through market expansion into APAC and EMEA regions.
                        </p>
                      </div>
                      {matrixEffectiveProgress >= 0.56 && (
                        <motion.div
                          className="flex items-start gap-1.5 p-1.5 bg-white/[0.02] border border-white/[0.04] rounded"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <FileText className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
                          <p className="text-[9px] text-slate-300 leading-relaxed">
                            Q4 strategy memo outlines 3-year expansion roadmap with $15M allocated.
                          </p>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* Chat Icon - visible before chat expands */}
          <motion.div
            className="absolute right-4 top-1/2 -translate-y-1/2 z-30"
            style={{ opacity: chatIconOpacity }}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)]">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
            </div>
          </motion.div>

          {/* Tagline for Cell Expansion - positioned below interface */}
          <motion.div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center z-10"
            style={{ opacity: cellExpandTaglineOpacity }}
          >
            <p className="text-[10px] text-emerald-500/70 uppercase tracking-[0.25em] font-semibold">
              Deep Context on Demand
            </p>
            <p className="text-[9px] text-slate-600 mt-0.5">
              Click any cell to see reasoning and source citations
            </p>
          </motion.div>

          {/* Tagline for Chat Appearance - positioned below interface */}
          <motion.div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center z-10"
            style={{ opacity: chatTaglineOpacity }}
          >
            <p className="text-[10px] text-emerald-500/70 uppercase tracking-[0.25em] font-semibold">
              Your Analyst is Ready
            </p>
            <p className="text-[9px] text-slate-600 mt-0.5">
              Ask questions. Get cited answers in real-time.
            </p>
          </motion.div>
        </motion.div>

        {/* CTA Section - Appears after demo fades out */}
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center z-50 pointer-events-none"
          style={{ opacity: ctaOpacity }}
        >
          <div className="text-center pointer-events-auto">
            {/* Logo */}
            <motion.div
              className="flex flex-col items-center gap-3 mb-8"
              style={{ scale: ctaScale }}
            >
              <div className="w-14 h-14 bg-emerald-600 rounded-xl flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.4)]">
                <Database className="text-black w-7 h-7" />
              </div>
              <h2 className="text-2xl font-extralight tracking-tighter text-white">
                2.0Labs<span className="text-emerald-500 opacity-60 italic">_</span>
              </h2>
            </motion.div>

            {/* Tagline */}
            <motion.p
              className="text-sm text-slate-400 mb-8 max-w-md mx-auto"
              style={{ scale: ctaScale }}
            >
              Your documents. Synthesized. Ready to query.
            </motion.p>

            {/* CTA Button */}
            <motion.button
              onClick={onProceed}
              style={{ scale: ctaScale }}
              className="group px-10 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl transition-all duration-300 shadow-[0_0_50px_rgba(16,185,129,0.5)] hover:shadow-[0_0_80px_rgba(16,185,129,0.6)] flex items-center gap-3 text-base mx-auto"
            >
              <span className="tracking-wide">Start Synthesizing</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Grid overlay for aesthetic */}
      <div
        className="fixed inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
          backgroundSize: '100px 100px'
        }}
      />
    </div>
  );
};

export default HeroLanding;
