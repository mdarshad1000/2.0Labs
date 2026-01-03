
import React from 'react';
import { Database } from 'lucide-react';

interface ReservoirIndicatorProps {
  documentCount: number;
  onClick?: () => void;
  className?: string;
}

/**
 * ReservoirIndicator - A neutral, reusable indicator showing document count.
 * Designed to feel like gravity — always present, unobtrusive unless needed.
 * 
 * Usage:
 * - In Atlas: Clicking opens the sidebar
 * - In Prism: Clicking opens document selection
 */
const ReservoirIndicator: React.FC<ReservoirIndicatorProps> = ({ 
  documentCount, 
  onClick,
  className = ''
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-1.5 
        bg-emerald-500/5 hover:bg-emerald-500/10
        border border-emerald-500/20 hover:border-emerald-500/30
        rounded-lg transition-all cursor-pointer
        group
        ${className}
      `}
      title="View Reservoir documents"
    >
      <Database className="w-3.5 h-3.5 text-emerald-500/60 group-hover:text-emerald-500/80 transition-colors" />
      <span className="text-[10px] font-medium text-emerald-500/70 group-hover:text-emerald-500/90 transition-colors">
        Reservoir: {documentCount} document{documentCount !== 1 ? 's' : ''}
      </span>
    </button>
  );
};

export default ReservoirIndicator;

