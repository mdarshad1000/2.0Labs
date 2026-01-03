
import React from 'react';
import { FileText, Download, Loader2, Cpu, Database, Eye, Trash2 } from 'lucide-react';

interface ReservoirDocument {
  id: string;
  name: string;
  size: number;
  type?: string;
}

interface ReservoirPanelProps {
  documents: ReservoirDocument[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
  onPreview?: (doc: ReservoirDocument) => void;
  onDelete?: (docId: string) => void;
  className?: string;
}

/**
 * ReservoirPanel - Unified sidebar for document management across all views.
 * 
 * Design principle: "Reservoir should feel like gravity — always present, 
 * never interacted with directly unless needed."
 * 
 * Used in both Atlas (graph) and Prism (matrix) views for consistency.
 */
const ReservoirPanel: React.FC<ReservoirPanelProps> = ({ 
  documents, 
  onUpload, 
  isUploading,
  onPreview,
  onDelete,
  className = ''
}) => {
  return (
    <aside className={`w-full glass-surface rounded-xl flex flex-col z-40 border border-emerald-500/10 overflow-hidden h-full ${className}`}>
      {/* Header - Reservoir Branding */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-3.5 h-3.5 text-emerald-500/70" />
          <h2 className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-[0.2em]">Reservoir</h2>
        </div>
        
        {/* Ingest Area - Drag & Drop Zone */}
        <label className={`
          flex flex-col items-center justify-center w-full h-24 
          border-2 border-dashed border-white/10 rounded-xl 
          cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/[0.02]
          transition-all group relative overflow-hidden
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}>
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Ingesting...</span>
            </div>
          ) : (
            <>
              <Download className="w-5 h-5 text-slate-600 group-hover:text-emerald-400 mb-1.5 transition-colors rotate-180" />
              <span className="text-[10px] font-medium text-slate-500 group-hover:text-emerald-400 transition-colors">
                Ingest Documents
              </span>
              <span className="text-[8px] text-slate-600 mt-0.5">.txt, .md, .pdf</span>
            </>
          )}
          <input 
            type="file" 
            multiple 
            className="hidden" 
            onChange={onUpload} 
            accept=".txt,.md,.pdf,application/pdf,text/plain,text/markdown" 
          />
        </label>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em]">
            Documents ({documents.length})
          </span>
        </div>
        
        {documents.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-[10px] text-slate-600 italic leading-relaxed">
              No documents ingested yet.
            </p>
            <p className="text-[9px] text-slate-700 mt-2">
              Upload documents above, then reference them with <span className="text-emerald-500/80 font-mono">@</span> in search.
            </p>
          </div>
        ) : (
          documents.map((doc) => (
            <div 
              key={doc.id}
              className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-white/[0.03] border border-transparent hover:border-white/[0.04] transition-all cursor-default group"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500/60 shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-slate-300 truncate">{doc.name}</p>
                <p className="text-[9px] text-slate-600 uppercase font-bold tracking-wide">
                  {(doc.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {/* Actions - visible on hover */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                {onPreview && (
                  <button 
                    onClick={() => onPreview(doc)} 
                    className="p-1 hover:text-emerald-400 text-slate-500 transition-all rounded" 
                    title="Preview"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                )}
                {onDelete && (
                  <button 
                    onClick={() => onDelete(doc.id)} 
                    className="p-1 hover:text-rose-400 text-slate-500 transition-all rounded" 
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Status Footer */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <Cpu className="w-3 h-3 text-emerald-500/60" />
          AI Engine Ready
        </div>
      </div>
    </aside>
  );
};

export default ReservoirPanel;

