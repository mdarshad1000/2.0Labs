
import React, { useState, useRef } from 'react';
import { Document } from '../../types';
import { Search, ArrowRight, X, FileText, Check, Paperclip, Globe } from 'lucide-react';

interface GraphSearchBarProps {
  documents: Document[];
  onQuery: (query: string, docIds: string[]) => void;
  isLoading: boolean;
}

const GraphSearchBar = React.forwardRef<HTMLDivElement, GraphSearchBarProps>(({ documents, onQuery, isLoading }, ref) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [attachedDocs, setAttachedDocs] = useState<Document[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isWebSearch, setIsWebSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newDocs: Document[] = Array.from(files).map(file => ({
      id: `temp-${Date.now()}-${file.name}`,
      name: file.name,
      type: file.type,
      size: file.size,
      content: '', // Content would potentially be read here or on backend
      blobUrl: URL.createObjectURL(file)
    }));

    setAttachedDocs(prev => [...prev, ...newDocs]);
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';

    inputRef.current?.focus();
  };

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
    <div ref={ref} className="relative group">
      <div className={`
        glass-surface rounded-none border border-white/10 p-2 transition-all duration-300 
        shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_24px_rgba(16,185,129,0.05)]
        ${isLoading ? 'opacity-50 pointer-events-none' : 'hover:border-white/20'}
      `}>

        {/* Attached Documents */}
        {attachedDocs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 p-2">
            {attachedDocs.map(doc => (
              <span
                key={doc.id}
                className="bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-none text-[9px] font-bold flex items-center gap-1.5 border border-emerald-500/25"
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
          <div className="p-2 pl-4 text-slate-500">
            <Search className="w-4 h-4" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isWebSearch ? "Search the web..." : "Ask anything"}
            className="flex-1 bg-transparent py-3 text-slate-200 outline-none text-[13px] placeholder:text-slate-600 font-light px-2"
          />
          <div className="flex items-center gap-2 pr-1">
            {/* Contextual Actions Popover */}
            <div
              className={`flex items-center gap-1 mr-1 transition-all duration-300 ease-out ${inputValue ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
                }`}
            >
              <button
                onClick={handleFileClick}
                className="p-1.5 text-slate-400 hover:text-white rounded transition-colors hover:bg-white/5"
                title="Attach file"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                onChange={handleFileChange}
              />

              <button
                onClick={() => setIsWebSearch(!isWebSearch)}
                className={`p-1.5 rounded transition-all hover:bg-white/5 ${isWebSearch ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                title="Toggle Web Search"
              >
                <Globe className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim() || isLoading}
              className="p-2.5 bg-orange-500 text-black rounded-none hover:bg-orange-400 disabled:bg-slate-700 disabled:text-slate-500 transition-all shadow-lg active:scale-95 disabled:active:scale-100"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Document Suggestions Dropdown */}
        {showSuggestions && filteredDocs.length > 0 && (
          <div className="absolute top-full mt-3 left-0 w-72 glass-surface border border-white/10 rounded-none shadow-2xl overflow-hidden z-50 animate-fade-in">
            <div className="p-3 border-b border-white/[0.06] text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em]">
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
                    <div className={`w-6 h-6 rounded-none flex items-center justify-center transition-all
                    ${index === highlightedIndex ? 'bg-orange-500 text-black' : 'bg-white/5 text-slate-500'}`}>
                      <FileText className="w-3 h-3" />
                    </div>
                    <div className="flex flex-col">
                      <span className={`font-medium text-[11px] truncate max-w-[160px] ${index === highlightedIndex ? 'text-white' : 'text-slate-300'}`}>
                        @{doc.name}
                      </span>
                      <span className="text-[8px] text-slate-600 font-bold uppercase">
                        {(doc.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  </div>
                  <Check className={`w-3.5 h-3.5 text-orange-500 transition-all ${index === highlightedIndex ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

GraphSearchBar.displayName = 'GraphSearchBar';

export default GraphSearchBar;

