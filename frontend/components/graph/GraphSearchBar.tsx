
import React, { useState, useRef } from 'react';
import { Document } from '../../types';
import { Search, ArrowRight, X, FileText, Check } from 'lucide-react';

interface GraphSearchBarProps {
  documents: Document[];
  onQuery: (query: string, docIds: string[]) => void;
  isLoading: boolean;
}

const GraphSearchBar: React.FC<GraphSearchBarProps> = ({ documents, onQuery, isLoading }) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [attachedDocs, setAttachedDocs] = useState<Document[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    const atPos = val.lastIndexOf('@');
    
    if (atPos !== -1 && (atPos === 0 || val[atPos - 1] === ' ')) {
      setShowSuggestions(true);
      setMentionIndex(atPos);
      setHighlightedIndex(0); // Reset to first item when opening
    } else {
      setShowSuggestions(false);
    }
  };

  // Filtered documents for dropdown - moved before handlers that use it
  const filteredDocs = documents.filter(doc => {
    // Exclude already attached documents
    if (attachedDocs.some(d => d.id === doc.id)) return false;
    
    const query = inputValue.split('@').pop()?.toLowerCase() || '';
    return doc.name.toLowerCase().includes(query);
  });

  const handleSelectDoc = (doc: Document) => {
    if (!attachedDocs.find(d => d.id === doc.id)) {
      setAttachedDocs([...attachedDocs, doc]);
    }
    // Clear the @ mention from input, keep only text before @
    const before = inputValue.substring(0, mentionIndex);
    setInputValue(before.trim());
    setShowSuggestions(false);
    setHighlightedIndex(0); // Reset highlight
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle dropdown navigation when suggestions are visible
    if (showSuggestions && filteredDocs.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredDocs.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredDocs.length - 1
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSelectDoc(filteredDocs[highlightedIndex]);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        handleSelectDoc(filteredDocs[highlightedIndex]);
        return;
      }
    }
    
    // Normal Enter to submit query
    if (e.key === 'Enter' && !isLoading && inputValue.trim()) {
      onQuery(inputValue, attachedDocs.map(d => d.id));
      setInputValue('');
      setAttachedDocs([]);
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const removeDoc = (id: string) => {
    setAttachedDocs(prev => prev.filter(d => d.id !== id));
  };

  const handleSubmit = () => {
    if (inputValue.trim() && !isLoading) {
      onQuery(inputValue, attachedDocs.map(d => d.id));
      setInputValue('');
      setAttachedDocs([]);
    }
  };

  return (
    <div className="relative group">
      <div className={`
        glass-surface rounded-2xl border border-emerald-500/15 p-2 transition-all duration-300 
        shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_24px_rgba(16,185,129,0.05)]
        ${isLoading ? 'opacity-50 pointer-events-none' : 'hover:border-emerald-500/25'}
      `}>
        
        {/* Attached Documents */}
        {attachedDocs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-2">
            {attachedDocs.map(doc => (
              <span 
                key={doc.id} 
                className="bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-full text-[9px] font-bold flex items-center gap-1.5 border border-emerald-500/25"
              >
                <FileText className="w-2.5 h-2.5" />
                @{doc.name}
                <button 
                  onClick={() => removeDoc(doc.id)} 
                  className="hover:text-rose-400 transition-colors ml-0.5"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input Row */}
        <div className="flex items-center gap-2 px-2">
          <div className="p-2 text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input 
            ref={inputRef}
            type="text" 
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question... type @ to reference documents"
            className="flex-1 bg-transparent py-3 text-slate-200 outline-none text-[13px] placeholder:text-slate-600 font-light"
          />
          <button 
            onClick={handleSubmit}
            disabled={!inputValue.trim() || isLoading}
            className="p-2.5 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 transition-all shadow-lg active:scale-95 disabled:active:scale-100"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Document Suggestions Dropdown */}
      {showSuggestions && filteredDocs.length > 0 && (
        <div className="absolute top-full mt-3 left-0 w-72 glass-surface border border-emerald-500/15 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in">
          <div className="p-3 border-b border-white/[0.06] text-[8px] font-bold text-emerald-500/60 uppercase tracking-[0.2em]">
            Reference Documents
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {filteredDocs.map((doc, index) => (
              <button 
                key={doc.id}
                onClick={() => handleSelectDoc(doc)}
                className={`w-full text-left px-4 py-3 transition-colors border-b border-white/[0.03] last:border-0 flex items-center justify-between group/item
                  ${index === highlightedIndex ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all
                    ${index === highlightedIndex ? 'bg-emerald-500 text-black' : 'bg-emerald-500/10 text-emerald-500/60 group-hover/item:bg-emerald-500 group-hover/item:text-black'}`}>
                    <FileText className="w-3 h-3" />
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-medium text-[11px] truncate max-w-[160px] ${index === highlightedIndex ? 'text-emerald-300' : 'text-slate-300'}`}>
                      @{doc.name}
                    </span>
                    <span className="text-[8px] text-slate-600 font-bold uppercase">
                      {(doc.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                </div>
                <Check className={`w-3.5 h-3.5 text-emerald-500 transition-all ${index === highlightedIndex ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GraphSearchBar;

