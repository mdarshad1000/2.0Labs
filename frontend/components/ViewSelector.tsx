
import React from 'react';
import { 
  Database, 
  ArrowRight, 
  Layers, 
  Network,
  Table2,
  GitBranch
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ViewSelectorProps {
  onSelectMatrix: () => void;
  onSelectGraph: () => void;
  onBack: () => void;
}

const ViewSelector: React.FC<ViewSelectorProps> = ({ 
  onSelectMatrix, 
  onSelectGraph,
  onBack 
}) => {
  const { user } = useAuth();

  return (
    <div className="landing-container h-screen w-full flex flex-col items-center justify-center bg-[#030a06] text-slate-300 p-6 font-['Epilogue'] relative overflow-hidden text-[12px]">
      {/* Grain overlay */}
      <div className="landing-grain" aria-hidden="true" />
      
      {/* Ambient background gradient */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-0"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(16, 185, 129, 0.03) 0%, transparent 60%)',
          animation: 'resolveContainer 0.6s cubic-bezier(0.25, 0.1, 0.25, 1) 0.1s forwards'
        }}
        aria-hidden="true"
      />
      
      {/* Logo & Title Section */}
      <div className="flex flex-col items-center gap-1.5 mb-10 relative z-10">
        <div className="landing-logo w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.2)] mb-4">
          <Database className="text-black w-5 h-5" />
        </div>
        <h1 className="landing-title text-4xl font-extralight tracking-tighter text-white">
          2.0Labs<span className="text-emerald-500 opacity-60 italic">_</span>
        </h1>
        <p className="landing-subtitle text-[10px] uppercase tracking-[0.6em] font-light mt-1">
          Thinking Instrument
        </p>
        <p className="landing-hint text-[12px] text-slate-400 font-light mt-4 tracking-wide">
          Choose your analysis mode
        </p>
      </div>

      {/* View Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl w-full px-6 relative z-10">
        {/* Prism - Matrix View */}
        <button
          onClick={onSelectMatrix}
          className="landing-card idle-drift-1 glass-surface p-8 rounded-xl text-left flex flex-col min-h-[280px] group"
          style={{ '--card-delay': '0ms' } as React.CSSProperties}
        >
          <div className="landing-card-icon w-12 h-12 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center mb-6 transition-all duration-500 shrink-0 group-hover:scale-110 group-hover:border-emerald-500/50">
            <Table2 className="w-6 h-6 text-emerald-400" />
          </div>
          
          <h3 className="landing-card-title text-white text-[22px] font-light tracking-tight mb-2 leading-snug">
            Prism
          </h3>
          <p className="landing-card-title text-[9px] uppercase tracking-[0.15em] text-emerald-500/60 font-semibold mb-3">
            Structured Extraction
          </p>
          <p className="landing-card-desc text-[13px] leading-relaxed text-slate-400 mb-6 font-light flex-1">
            Extract structured data from documents into a tabular format. Define metrics, upload files, and let AI populate your matrix with citations and reasoning.
          </p>
          
          <div className="flex items-center gap-3 text-slate-500 text-[11px] mb-4">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Templates</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <Table2 className="w-3.5 h-3.5" />
              <span>Structured Data</span>
            </div>
          </div>
          
          <div className="landing-card-action mt-auto pt-2 flex items-center gap-1.5 text-emerald-500 text-[10px] uppercase tracking-[0.2em] font-semibold transition-opacity duration-500">
            Enter Prism <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Atlas - Graph View */}
        <button
          onClick={onSelectGraph}
          className="landing-card idle-drift-2 glass-surface p-8 rounded-xl text-left flex flex-col min-h-[280px] group"
          style={{ '--card-delay': '80ms' } as React.CSSProperties}
        >
          <div className="landing-card-icon w-12 h-12 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center mb-6 transition-all duration-500 shrink-0 group-hover:scale-110 group-hover:border-emerald-500/50">
            <Network className="w-6 h-6 text-emerald-400" />
          </div>
          
          <h3 className="landing-card-title text-white text-[22px] font-light tracking-tight mb-2 leading-snug">
            Atlas
          </h3>
          <p className="landing-card-title text-[9px] uppercase tracking-[0.15em] text-emerald-500/60 font-semibold mb-3">
            Visual Canvas
          </p>
          <p className="landing-card-desc text-[13px] leading-relaxed text-slate-400 mb-6 font-light flex-1">
            Explore your research on an infinite canvas. Generate visual knowledge graphs, expand nodes, and synthesize insights across connected concepts.
          </p>
          
          <div className="flex items-center gap-3 text-slate-500 text-[11px] mb-4">
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" />
              <span>Expandable</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5" />
              <span>Connected</span>
            </div>
          </div>
          
          <div className="landing-card-action mt-auto pt-2 flex items-center gap-1.5 text-emerald-500 text-[10px] uppercase tracking-[0.2em] font-semibold transition-opacity duration-500">
            Enter Atlas <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      {/* Back link */}
      <button
        onClick={onBack}
        className="mt-10 text-[11px] text-slate-500 hover:text-emerald-400 transition-colors uppercase tracking-[0.15em] font-semibold relative z-10"
      >
        ← Back to Home
      </button>
    </div>
  );
};

export default ViewSelector;

