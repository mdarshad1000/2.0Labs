
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Plus, 
  FileText, 
  Activity, 
  Trash2,
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Loader2,
  Info,
  Layers,
  BarChart2,
  ArrowRight,
  Database,
  History,
  X,
  PanelLeftClose,
  PanelLeft,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  User,
  LogOut
} from 'lucide-react';
import { createPortal } from 'react-dom';
// PDF viewer using react-pdf
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import { 
  Document as DocType, 
  Metric, 
  Template, 
  ActivityLog,
  CellData
} from './types';
import { DEMO_DATA } from './constants';
import ChatPanel from './components/ChatPanel';
import HeroLanding from './components/HeroLanding';
import LoginPage from './components/LoginPage';
import AuthCallback from './components/AuthCallback';
import ViewSelector from './components/ViewSelector';
import { GraphCanvas, GraphSidebar } from './components/graph';
import ReservoirIndicator from './components/ReservoirIndicator';
import ReservoirPanel from './components/ReservoirPanel';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { api, MatrixContext, AnalyticalQuestion, VisualizationSpec, TemplateData } from './services/api';
import { GraphProject } from './types';

type CellMap = Record<string, CellData>;

// Analytical Questions Glyph Component with Portal Dropdown
interface AnalyticalQuestionsGlyphProps {
  isVisible: boolean;
  isOpen: boolean;
  isLoading: boolean;
  questions: AnalyticalQuestion[];
  dropdownRef: React.RefObject<HTMLDivElement>;
  onToggle: () => void;
  onClose: () => void;
  onSelectQuestion: (q: AnalyticalQuestion) => void;
}

// Cell Detail Overlay - Floating contextual panel for expanded cell content
interface CellOverlayProps {
  cell: CellData;
  metric: Metric;
  document: DocType;
  anchorRect: DOMRect;
  onClose: () => void;
  onOpenDocument: (doc: DocType) => void;
  reasoningExpanded: boolean;
  onToggleReasoning: () => void;
}

const CellDetailOverlay: React.FC<CellOverlayProps> = ({
  cell,
  metric,
  document: docProp,
  anchorRect,
  onClose,
  onOpenDocument,
  reasoningExpanded,
  onToggleReasoning,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; placement: string }>({ top: 0, left: 0, placement: 'right' });

  // Calculate optimal position on mount and when anchor changes
  useEffect(() => {
    if (!overlayRef.current) return;

    const overlayWidth = 320;
    const overlayHeight = Math.min(overlayRef.current.scrollHeight, window.innerHeight * 0.7);
    const gap = 12; // Space between cell and overlay
    const padding = 16; // Viewport edge padding

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate available space in each direction
    const spaceRight = viewportWidth - anchorRect.right - padding;
    const spaceLeft = anchorRect.left - padding;
    const spaceBelow = viewportHeight - anchorRect.bottom - padding;
    const spaceAbove = anchorRect.top - padding;

    let placement = 'right';
    let top = 0;
    let left = 0;

    // Prefer right, then left, then below, then above
    if (spaceRight >= overlayWidth + gap) {
      placement = 'right';
      left = anchorRect.right + gap;
      top = Math.max(padding, Math.min(anchorRect.top, viewportHeight - overlayHeight - padding));
    } else if (spaceLeft >= overlayWidth + gap) {
      placement = 'left';
      left = anchorRect.left - overlayWidth - gap;
      top = Math.max(padding, Math.min(anchorRect.top, viewportHeight - overlayHeight - padding));
    } else if (spaceBelow >= overlayHeight + gap) {
      placement = 'below';
      top = anchorRect.bottom + gap;
      left = Math.max(padding, Math.min(anchorRect.left, viewportWidth - overlayWidth - padding));
    } else {
      placement = 'above';
      top = anchorRect.top - overlayHeight - gap;
      left = Math.max(padding, Math.min(anchorRect.left, viewportWidth - overlayWidth - padding));
    }

    // Ensure overlay stays within viewport
    top = Math.max(padding, Math.min(top, viewportHeight - overlayHeight - padding));
    left = Math.max(padding, Math.min(left, viewportWidth - overlayWidth - padding));

    setPosition({ top, left, placement });
  }, [anchorRect]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const timer = setTimeout(() => {
      window.document.addEventListener('mousedown', handleClickOutside);
      window.document.addEventListener('keydown', handleEscape);
    }, 10);

    return () => {
      clearTimeout(timer);
      window.document.removeEventListener('mousedown', handleClickOutside);
      window.document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed z-[9999] w-[280px] max-h-[60vh] overflow-hidden bg-[#030a06]/98 backdrop-blur-xl border border-emerald-500/15 rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_24px_rgba(16,185,129,0.08)] animate-fade-in flex flex-col"
      style={{
        top: position.top,
        left: position.left,
        animationDuration: '120ms',
      }}
    >
      {/* Connector line visual hint */}
      <div 
        className={`absolute w-2.5 h-2.5 bg-emerald-500/10 border-emerald-500/25 rotate-45 ${
          position.placement === 'right' ? '-left-1 top-5 border-l border-b' :
          position.placement === 'left' ? '-right-1 top-5 border-r border-t' :
          position.placement === 'below' ? 'left-8 -top-1 border-t border-l' :
          'left-8 -bottom-1 border-b border-r'
        }`}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-white/[0.05] bg-emerald-500/[0.02]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            cell.confidence === 'High' ? 'bg-emerald-500' : 
            cell.confidence === 'Medium' ? 'bg-amber-500' : 'bg-orange-500'
          }`} />
          <span className="text-[9px] font-semibold text-white/60 uppercase tracking-[0.1em] truncate max-w-[180px]">
            {metric.label}
          </span>
          <span className={`text-[8px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full ${
            cell.confidence === 'High' ? 'text-emerald-400/70 bg-emerald-500/12' : 
            cell.confidence === 'Medium' ? 'text-amber-400/70 bg-amber-500/12' : 
            'text-orange-400/70 bg-orange-500/12'
          }`}>
            {cell.confidence}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-500 hover:text-white hover:bg-white/10 rounded-md transition-all"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Content */}
      <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto custom-scrollbar">
        {/* Extracted Value */}
        <div className="space-y-1">
          <p className="text-[11px] text-slate-100 font-mono leading-relaxed whitespace-pre-wrap">
            {cell.value}
          </p>
        </div>

        {/* Reasoning (Collapsible) */}
        {cell.reasoning && (
          <div>
            <button
              onClick={onToggleReasoning}
              className="flex items-center gap-1.5 text-[9px] text-emerald-500/50 hover:text-emerald-400 transition-colors"
            >
              <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${reasoningExpanded ? 'rotate-90' : ''}`} />
              <span className="uppercase tracking-[0.08em] font-semibold">Reasoning</span>
            </button>
            <div className={`overflow-hidden transition-all duration-150 ease-out ${reasoningExpanded ? 'max-h-[400px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
              <p className="text-[10px] text-slate-400 leading-relaxed font-light italic pl-2.5 border-l border-emerald-500/15">
                {cell.reasoning}
              </p>
            </div>
          </div>
        )}

        {/* Sources */}
        {cell.sources && cell.sources.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[8px] text-white/25 uppercase tracking-[0.08em] font-semibold">Sources</span>
            <div className="flex flex-col gap-1">
              {cell.sources.map((source, idx) => (
                <button
                  key={idx}
                  onClick={() => onOpenDocument(docProp)}
                  className="group/src px-2 py-1.5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] hover:border-emerald-500/20 rounded-md transition-all flex items-start gap-2 w-full text-left"
                >
                  <FileText className="w-3 h-3 text-slate-500 group-hover/src:text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-[9px] text-slate-400 group-hover/src:text-slate-300 leading-relaxed">
                    {source}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    window.document.body
  );
};

const AnalyticalQuestionsGlyph: React.FC<AnalyticalQuestionsGlyphProps> = ({
  isVisible,
  isOpen,
  isLoading,
  questions,
  dropdownRef,
  onToggle,
  onClose,
  onSelectQuestion,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
  }, [isOpen]);

  // Click outside handler
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        onClose();
      }
    };
    
    // Small delay to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, dropdownRef]);

  if (!isVisible) return null;

  // Limit to 5 questions
  const displayedQuestions = questions.slice(0, 5);

  return (
    <>
      {/* Glyph Button - subtle fade-in */}
      <button
        ref={buttonRef}
        onClick={onToggle}
        className="p-1 hover:bg-white/5 rounded transition-all animate-fade-in"
        title="Analyze entities"
        style={{ animationDuration: '200ms' }}
      >
        <BarChart2 
          className={`w-3 h-3 transition-colors duration-150 ${
            isOpen ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-400'
          }`} 
        />
      </button>

      {/* Portal Dropdown - rendered outside component tree */}
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-64 bg-[#020804]/98 backdrop-blur-xl border border-white/[0.06] rounded-lg shadow-xl overflow-hidden animate-fade-in"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            zIndex: 9999,
            animationDuration: '120ms',
          }}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/[0.05]">
            <p className="text-[9px] text-white/40 uppercase tracking-wider">What would you like to explore?</p>
          </div>
          
          {/* Content */}
          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <div className="px-3 py-6 flex items-center justify-center">
                <div className="flex items-center gap-2 text-white/40">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[10px]">Analyzing...</span>
                </div>
              </div>
            ) : displayedQuestions.length === 0 ? (
              <div className="px-3 py-6 text-center text-white/40 text-[10px]">
                No questions available
              </div>
            ) : (
              <div className="py-1">
                {displayedQuestions.map((q, idx) => (
                  <button
                    key={q.id}
                    onClick={() => onSelectQuestion(q)}
                    className="w-full px-3 py-2 text-left hover:bg-white/[0.03] transition-colors group/q"
                  >
                    <p className="text-[11px] text-white/60 group-hover/q:text-white/80 leading-relaxed">
                      {q.question}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// User Menu Component
const UserMenu: React.FC = () => {
  const { user, logout, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!user) return null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
      >
        {user.picture ? (
          <img 
            src={user.picture} 
            alt={user.name || 'User'} 
            className="w-7 h-7 rounded-full border border-white/10"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center ${user.picture ? 'hidden' : ''}`}>
          <User className="w-3.5 h-3.5 text-emerald-400" />
        </div>
      </button>
      
      {isOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed w-56 bg-[#020804]/98 backdrop-blur-xl border border-white/[0.06] rounded-lg shadow-xl overflow-hidden animate-fade-in"
          style={{
            top: dropdownPosition.top,
            right: dropdownPosition.right,
            zIndex: 99999,
          }}
        >
          <div className="px-3 py-2 border-b border-white/[0.05]">
            <p className="text-sm text-white font-light truncate">{user.name || 'User'}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              disabled={loading}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.03] transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// Main App Content (separated to use auth context)
const AppContent: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  
  // Parse route info from URL
  type ViewType = 'hero' | 'view-selector' | 'templates' | 'template' | 'graph' | 'login' | 'auth-callback';
  
  const getRouteFromPath = (): { view: ViewType; templateId?: string } => {
    const path = window.location.pathname;
    if (path === '/login') return { view: 'login' };
    if (path === '/auth/callback') return { view: 'auth-callback' };
    if (path === '/thinking') return { view: 'view-selector' };
    if (path === '/templates') return { view: 'templates' };
    if (path === '/graph') return { view: 'graph' };
    // Match /template/:id pattern
    const templateMatch = path.match(/^\/template\/([a-f0-9-]+)$/i);
    if (templateMatch) return { view: 'template', templateId: templateMatch[1] };
    return { view: 'hero' };
  };
  
  const [view, setView] = useState<ViewType>(() => getRouteFromPath().view);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | undefined>(() => getRouteFromPath().templateId);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  
  // Fetch templates on mount and when user changes
  useEffect(() => {
    const loadTemplates = async () => {
      setTemplatesLoading(true);
      try {
        const response = await api.getTemplates();
        // Convert API response to Template type
        const templateList: Template[] = response.templates.map(t => ({
          id: t.id,
          name: t.name,
          subtitle: t.subtitle,
          description: t.description,
          metrics: t.metrics.map(m => ({
            id: m.id,
            label: m.label,
            description: m.description,
            type: m.type as 'numeric' | 'qualitative' | 'binary' | undefined
          })),
          user_id: t.user_id,
          is_system: t.is_system,
          forked_from_id: t.forked_from_id,
          created_at: t.created_at,
          updated_at: t.updated_at,
        }));
        setTemplates(templateList);
      } catch (error) {
        console.error('Failed to load templates:', error);
      } finally {
        setTemplatesLoading(false);
      }
    };
    loadTemplates();
  }, [user]);
  
  // Protect routes on initial load and auth state changes
  useEffect(() => {
    const protectedViews: ViewType[] = ['templates', 'template', 'graph'];
    
    // If on a protected route and not authenticated (and not loading), redirect to login
    if (protectedViews.includes(view) && !user && !authLoading) {
      localStorage.setItem('returnTo', window.location.pathname);
      window.history.replaceState({}, '', '/login');
      setView('login');
    }
  }, [view, user, authLoading]);
  
  // Handle URL changes (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const route = getRouteFromPath();
      setView(route.view);
      setCurrentTemplateId(route.templateId);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigate to a view and update URL
  // Protected routes (templates, template, graph) require authentication
  const navigateTo = useCallback((newView: ViewType, templateId?: string) => {
    let path: string;
    if (newView === 'template' && templateId) {
      path = `/template/${templateId}`;
    } else {
      const pathMap: Record<ViewType, string> = {
        'hero': '/',
        'view-selector': '/thinking',
        'templates': '/templates',
        'template': '/templates', // Fallback if no templateId
        'graph': '/graph',
        'login': '/login',
        'auth-callback': '/auth/callback',
      };
      path = pathMap[newView];
    }
    
    // Protected routes - require authentication
    const protectedViews: ViewType[] = ['templates', 'template', 'graph'];
    
    if (protectedViews.includes(newView) && !user) {
      // Store intended destination and redirect to login
      localStorage.setItem('returnTo', path);
      window.history.pushState({}, '', '/login');
      setView('login');
      return;
    }
    
    const currentPath = window.location.pathname;
    if (path !== currentPath) {
      window.history.pushState({}, '', path);
      setView(newView);
      setCurrentTemplateId(templateId);
    }
  }, [user]);
  
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [cells, setCells] = useState<CellMap>({});
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isToastExpanded, setIsToastExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocType | null>(null);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [highlightedCell, setHighlightedCell] = useState<string | null>(null);
  
  // Graph view state
  const [graphProject, setGraphProject] = useState<GraphProject>({
    id: 'default-graph',
    name: 'Research Canvas',
    description: 'Visual document analysis',
    createdAt: Date.now(),
    documents: [],
    nodes: []
  });
  const [isGraphUploading, setIsGraphUploading] = useState(false);
  const [isGraphSidebarExpanded, setIsGraphSidebarExpanded] = useState(true);
  
  // Cell overlay state
  const [anchorCellId, setAnchorCellId] = useState<string | null>(null);
  const [anchorCellRect, setAnchorCellRect] = useState<DOMRect | null>(null);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  // PDF viewer state
  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const [pdfScale, setPdfScale] = useState(1.0);
  // Analytical questions state
  const [analyticalQuestions, setAnalyticalQuestions] = useState<AnalyticalQuestion[]>([]);
  const [isQuestionsDropdownOpen, setIsQuestionsDropdownOpen] = useState(false);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<AnalyticalQuestion | null>(null);
  const [answerSummary, setAnswerSummary] = useState('');
  const [visualization, setVisualization] = useState<VisualizationSpec | null>(null);
  const [isLoadingAnswer, setIsLoadingAnswer] = useState(false);
  const questionsDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  
  // Create Template modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createTemplateForm, setCreateTemplateForm] = useState({
    name: '',
    subtitle: '',
    description: '',
    metrics: [] as Array<{ id: string; label: string; description: string }>,
    forkFromId: undefined as string | undefined,
  });
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

  const addLog = useCallback((message: string, type: ActivityLog['type'] = 'info') => {
    const newLog: ActivityLog = {
      id: Math.random().toString(36),
      timestamp: new Date(),
      message,
      type
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
  }, []);

  // Get anchor cell data for overlay
  const getAnchorCellData = useCallback(() => {
    if (!anchorCellId || !activeTemplate) return null;
    const cell = cells[anchorCellId];
    if (!cell) return null;
    
    const [docId, ...metricParts] = anchorCellId.split('-');
    const metricId = metricParts.join('-');
    const doc = documents.find(d => d.id === docId);
    const metric = activeTemplate.metrics.find(m => m.id === metricId);
    
    if (!doc || !metric) return null;
    return { cell, doc, metric };
  }, [anchorCellId, cells, documents, activeTemplate]);

  // Reset PDF viewer state when preview doc changes
  useEffect(() => {
    if (previewDoc) {
      setPdfNumPages(null);
      setPdfScale(1.0);
    }
  }, [previewDoc?.id]);

  // Click outside handler for questions dropdown
  useEffect(() => {
    if (!isQuestionsDropdownOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (questionsDropdownRef.current && !questionsDropdownRef.current.contains(e.target as Node)) {
        setIsQuestionsDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isQuestionsDropdownOpen]);

  // Clear analytical lens when entity set or column set changes
  // This is the proper lifecycle boundary for the lens
  const prevDocsRef = useRef<string>('');
  const prevMetricsRef = useRef<string>('');
  
  useEffect(() => {
    if (!activeTemplate) return;
    
    const currentDocsKey = documents.map(d => d.id).join(',');
    const currentMetricsKey = activeTemplate.metrics.map(m => m.id).join(',');
    
    // Skip on initial mount
    if (prevDocsRef.current === '' && prevMetricsRef.current === '') {
      prevDocsRef.current = currentDocsKey;
      prevMetricsRef.current = currentMetricsKey;
      return;
    }

    // Check if documents or metrics actually changed
    if (prevDocsRef.current !== currentDocsKey || prevMetricsRef.current !== currentMetricsKey) {
      // Clear analytical lens - the context has changed
      if (selectedQuestion) {
        setSelectedQuestion(null);
        setVisualization(null);
        setAnswerSummary('');
        setAnalyticalQuestions([]); // Questions are now stale too
      }
      prevDocsRef.current = currentDocsKey;
      prevMetricsRef.current = currentMetricsKey;
    }
  }, [documents, activeTemplate, selectedQuestion]);

  // Fetch analytical questions when dropdown opens
  const fetchAnalyticalQuestions = async () => {
    if (isLoadingQuestions || documents.length === 0) return;
    
    setIsLoadingQuestions(true);
      try {
        const matrixContext = getMatrixContext();
      const response = await api.getAnalyticalQuestions(matrixContext);
      setAnalyticalQuestions(response.questions);
      } catch (error) {
      console.error('Failed to fetch analytical questions:', error);
      setAnalyticalQuestions([]);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  // Handle question selection - opens chat panel with visualization
  const handleQuestionSelect = async (question: AnalyticalQuestion) => {
    setSelectedQuestion(question);
    setIsQuestionsDropdownOpen(false);
    setIsLoadingAnswer(true);
    setVisualization(null);
    setAnswerSummary('');
    
    // Open chat panel to show the visualization
    setIsChatOpen(true);
    
    try {
      const matrixContext = getMatrixContext();
      const response = await api.answerQuestion(question, matrixContext);
      setAnswerSummary(response.answer_summary);
      setVisualization(response.visualization || null);
    } catch (error) {
      console.error('Failed to answer question:', error);
      setAnswerSummary('Unable to generate visualization for this question.');
    } finally {
      setIsLoadingAnswer(false);
    }
  };

  // Clear analytical answer in chat panel
  const handleClearAnalyticalAnswer = () => {
    setSelectedQuestion(null);
    setVisualization(null);
    setAnswerSummary('');
  };

  // Build matrix context for chat panel
  const getMatrixContext = useCallback((): MatrixContext => {
    const cellsForContext: Record<string, {
      value: string | null;
      isLoading: boolean;
      confidence?: string;
      reasoning?: string;
      sources?: string[];
      error?: string;
    }> = {};
    
    for (const k of Object.keys(cells)) {
      const v = cells[k];
      cellsForContext[k] = {
        value: v.value,
        isLoading: v.isLoading,
        confidence: v.confidence,
        reasoning: v.reasoning,
        sources: v.sources,
        error: v.error
      };
    }
    
    return {
      documents: documents.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        content: d.content,
        size: d.size,
        blobUrl: d.blobUrl
      })),
      metrics: (activeTemplate?.metrics || []).map(m => ({
        id: m.id,
        label: m.label,
        description: m.description
      })),
      cells: cellsForContext
    };
  }, [documents, activeTemplate, cells]);

  // Handle cell highlight from chat citations
  const handleCellHighlight = useCallback((docId: string, metricId: string) => {
    const cellId = `${docId}-${metricId}`;
    console.log('handleCellHighlight called:', { docId, metricId, cellId });
    console.log('Available documents:', documents.map(d => d.id));
    console.log('Available cells:', Object.keys(cells));
    
    setHighlightedCell(cellId);
    
    // Scroll to the cell if possible
    const cellElement = document.querySelector(`[data-cell-id="${cellId}"]`);
    console.log('Cell element found:', !!cellElement);
    if (cellElement) {
      cellElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Remove highlight after animation
    setTimeout(() => setHighlightedCell(null), 2000);
  }, [documents, cells]);

  // Handle document open from chat citations
  const handleDocumentOpen = useCallback((docId: string, section?: string) => {
    console.log('handleDocumentOpen called:', { docId, section });
    console.log('Available documents:', documents.map(d => ({ id: d.id, name: d.name })));
    
    const doc = documents.find(d => d.id === docId);
    console.log('Found document:', !!doc, doc?.name);
    if (doc) {
      setPreviewDoc(doc);
    } else {
      console.warn('Document not found for id:', docId);
    }
  }, [documents]);

  const latestLog = logs[0] || null;

  const selectTemplate = (t: Template) => {
    setActiveTemplate({ ...t });
    navigateTo('template', t.id);
    addLog(`Workspace Loaded: ${t.name}`, 'process');
  };

  // Handle template creation
  const handleCreateTemplate = async () => {
    if (!createTemplateForm.name.trim()) return;
    
    setIsCreatingTemplate(true);
    try {
      let createdTemplate;
      
      if (createTemplateForm.forkFromId) {
        // Fork an existing template
        createdTemplate = await api.forkTemplate(createTemplateForm.forkFromId, {
          name: createTemplateForm.name,
        });
      } else {
        // Create new template
        createdTemplate = await api.createTemplate({
          name: createTemplateForm.name,
          subtitle: createTemplateForm.subtitle || undefined,
          description: createTemplateForm.description || undefined,
          metrics: createTemplateForm.metrics.map(m => ({
            id: m.id || `metric-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            label: m.label,
            description: m.description || undefined,
          })),
        });
      }
      
      // Add to templates list
      const newTemplate: Template = {
        id: createdTemplate.id,
        name: createdTemplate.name,
        subtitle: createdTemplate.subtitle,
        description: createdTemplate.description,
        metrics: createdTemplate.metrics.map(m => ({
          id: m.id,
          label: m.label,
          description: m.description,
          type: m.type as 'numeric' | 'qualitative' | 'binary' | undefined
        })),
        user_id: createdTemplate.user_id,
        is_system: createdTemplate.is_system,
        forked_from_id: createdTemplate.forked_from_id,
        created_at: createdTemplate.created_at,
        updated_at: createdTemplate.updated_at,
      };
      
      setTemplates(prev => [newTemplate, ...prev]);
      setIsCreateModalOpen(false);
      setCreateTemplateForm({
        name: '',
        subtitle: '',
        description: '',
        metrics: [],
        forkFromId: undefined,
      });
      
      // Navigate to the new template
      selectTemplate(newTemplate);
    } catch (error) {
      console.error('Failed to create template:', error);
      addLog('Failed to create template', 'error');
    } finally {
      setIsCreatingTemplate(false);
    }
  };
  
  // Open create modal with fork option
  const openCreateModal = (forkFromId?: string) => {
    if (forkFromId) {
      const sourceTemplate = templates.find(t => t.id === forkFromId);
      if (sourceTemplate) {
        setCreateTemplateForm({
          name: `${sourceTemplate.name} (Copy)`,
          subtitle: sourceTemplate.subtitle || '',
          description: sourceTemplate.description || '',
          metrics: sourceTemplate.metrics.map(m => ({
            id: m.id,
            label: m.label,
            description: m.description || '',
          })),
          forkFromId,
        });
      }
    } else {
      setCreateTemplateForm({
        name: '',
        subtitle: '',
        description: '',
        metrics: [],
        forkFromId: undefined,
      });
    }
    setIsCreateModalOpen(true);
  };
  
  // Add metric to form
  const addMetricToForm = () => {
    setCreateTemplateForm(prev => ({
      ...prev,
      metrics: [...prev.metrics, { id: `metric-${Date.now()}`, label: '', description: '' }],
    }));
  };
  
  // Remove metric from form
  const removeMetricFromForm = (index: number) => {
    setCreateTemplateForm(prev => ({
      ...prev,
      metrics: prev.metrics.filter((_, i) => i !== index),
    }));
  };
  
  // Update metric in form
  const updateMetricInForm = (index: number, field: 'label' | 'description', value: string) => {
    setCreateTemplateForm(prev => ({
      ...prev,
      metrics: prev.metrics.map((m, i) => i === index ? { ...m, [field]: value } : m),
    }));
  };

  // Function to go back to hero landing
  const goToHero = () => navigateTo('hero');
  
  // Load template when currentTemplateId changes (e.g., on page refresh or direct URL access)
  useEffect(() => {
    if (view === 'template' && currentTemplateId && !activeTemplate) {
      const loadTemplate = async () => {
        try {
          const templateData = await api.getTemplate(currentTemplateId);
          const template: Template = {
            id: templateData.id,
            name: templateData.name,
            subtitle: templateData.subtitle,
            description: templateData.description,
            metrics: templateData.metrics.map(m => ({
              id: m.id,
              label: m.label,
              description: m.description,
              type: m.type as 'numeric' | 'qualitative' | 'binary' | undefined
            })),
            user_id: templateData.user_id,
            is_system: templateData.is_system,
            forked_from_id: templateData.forked_from_id,
            created_at: templateData.created_at,
            updated_at: templateData.updated_at,
          };
          setActiveTemplate(template);
          addLog(`Workspace Loaded: ${template.name}`, 'process');
        } catch (error) {
          console.error('Failed to load template:', error);
          // Redirect to templates page if template not found
          navigateTo('templates');
        }
      };
      loadTemplate();
    }
  }, [view, currentTemplateId, activeTemplate, navigateTo, addLog]);

  // Trigger schema inference when documents change in "Blank" mode (system template with empty metrics)
  useEffect(() => {
    if (activeTemplate && activeTemplate.is_system && activeTemplate.metrics.length === 0 && documents.length > 0 && !isProcessing) {
      const runInference = async () => {
        setIsProcessing(true);
        addLog("Analyzing corpus to synthesize pillars...", "process");
        try {
          const docSnippets = documents.map(d => ({ name: d.name, content: d.content }));
          const suggested = await api.inferSchema(docSnippets);
          const inferredMetrics: Metric[] = suggested.map((label, idx) => ({
            id: `pillar-${idx}`,
            label
          }));
          setActiveTemplate(prev => ({ ...prev, metrics: inferredMetrics }));
          addLog(`Analytical schema calibrated.`, 'success');
        } catch (err) {
          addLog("Schema inference fault.", 'error');
        } finally {
          setIsProcessing(false);
        }
      };
      runInference();
    }
  }, [documents.length, activeTemplate?.id, activeTemplate?.is_system, activeTemplate?.metrics.length]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newDocs: DocType[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const blobUrl = URL.createObjectURL(file);
      
      try {
        // Upload to backend for PDF parsing
        addLog(`Processing: ${file.name}...`, 'info');
        const uploaded = await api.uploadDocument(file);
        
      newDocs.push({
          id: uploaded.id,
          name: uploaded.name,
          type: uploaded.type,
          size: uploaded.size,
          content: uploaded.content,
          blobUrl
      });
      addLog(`Mined: ${file.name}`, 'success');
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        addLog(`Failed to process: ${file.name}`, 'error');
        URL.revokeObjectURL(blobUrl);
      }
    }
    
    if (newDocs.length > 0) {
    setDocuments(prev => [...prev, ...newDocs]);
    }
  };

  const removeDoc = useCallback((id: string) => {
    setDocuments(prev => {
      const doc = prev.find(d => d.id === id);
      if (doc?.blobUrl) {
        URL.revokeObjectURL(doc.blobUrl);
      }
      return prev.filter(d => d.id !== id);
    });
    if (previewDoc?.id === id) {
      setPreviewDoc(null);
    }
    addLog("Asset purged.", "info");
  }, [addLog, previewDoc]);

  const computeCell = useCallback(async (docId: string, metric: Metric) => {
    const cellId = `${docId}-${metric.id}`;
    setCells(prev => ({ ...prev, [cellId]: { value: null, isLoading: true } }));
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    try {
      addLog(`Analyzing context for "${metric.label}"...`, 'process');
      const result = await api.extract(doc.content, metric.label);
      setCells(prev => ({
        ...prev,
        [cellId]: { 
          value: result.value, 
          isLoading: false, 
          confidence: result.confidence,
          reasoning: result.reasoning,
          sources: result.sources
        }
      }));
      addLog(`Extracted: ${metric.label}`, 'success');
    } catch (e) {
      addLog(`Extraction Fault: ${metric.label}`, 'error');
      setCells(prev => ({ ...prev, [cellId]: { value: 'Fault', isLoading: false, error: 'Synthesis Interrupted' } }));
    }
  }, [documents, addLog]);

  const computeAll = useCallback(() => {
    if (isProcessing || documents.length === 0 || !activeTemplate || activeTemplate.metrics.length === 0) return;
    setIsProcessing(true);
    addLog("Batch hydration active...", "process");
    const tasks = documents.flatMap(doc => 
      activeTemplate.metrics.map(metric => computeCell(doc.id, metric))
    );
    Promise.all(tasks).finally(() => {
      setIsProcessing(false);
      addLog("Matrix saturation complete.", "success");
    });
  }, [isProcessing, documents, activeTemplate, computeCell, setIsProcessing, addLog]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to trigger Hydrate Matrix
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
      const isModifierPressed = e.metaKey || e.ctrlKey;
      const isEnter = e.key === 'Enter';
      
      // Don't trigger if user is typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.isContentEditable;
      
      if (isModifierPressed && isEnter && !isInputField) {
        e.preventDefault();
        // Only trigger if button is enabled
        if (!isProcessing && documents.length > 0 && activeTemplate && activeTemplate.metrics.length > 0) {
          computeAll();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, documents.length, activeTemplate, computeAll]);

  // Login page
  if (view === 'login') {
    return (
      <LoginPage 
        onLoginSuccess={() => {
          // Redirect to saved returnTo path or home
          const returnTo = localStorage.getItem('returnTo') || '/';
          localStorage.removeItem('returnTo');
          window.location.href = returnTo;
        }} 
      />
    );
  }

  // Auth callback
  if (view === 'auth-callback') {
    return (
      <AuthCallback 
        onSuccess={() => {
          window.location.href = '/';
        }}
        onError={() => {
          window.location.href = '/login';
        }}
      />
    );
  }

  // Hero Landing - Scroll-driven animation landing page
  if (view === 'hero') {
    return <HeroLanding onProceed={() => navigateTo('view-selector')} onLogin={() => navigateTo('login')} />;
  }

  // View Selector - Choose between Matrix and Graph views
  if (view === 'view-selector') {
    return (
      <ViewSelector 
        onSelectMatrix={() => navigateTo('templates')} 
        onSelectGraph={() => navigateTo('graph')}
        onBack={() => navigateTo('hero')}
      />
    );
  }

  // Graph View - Infinite canvas for visual research
  if (view === 'graph') {
    const handleGraphFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      setIsGraphUploading(true);
      
      const newDocs: DocType[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const text = await file.text();
          newDocs.push({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            content: text.slice(0, 10000), // Limit size
            type: file.type,
            size: file.size
          });
        } catch (err) {
          console.error('Failed to read file', file.name, err);
        }
      }
      
      if (newDocs.length > 0) {
        setGraphProject(prev => ({
          ...prev,
          documents: [...prev.documents, ...newDocs]
        }));
      }
      setIsGraphUploading(false);
    };

    return (
      <div className="h-screen w-screen flex bg-[#030a06] font-['Epilogue']">
        {/* Graph Header */}
        <header className="fixed top-0 left-0 right-0 h-14 glass-surface border-b border-emerald-500/10 flex items-center justify-between px-6 z-50">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigateTo('view-selector')}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="font-semibold text-white leading-tight text-sm">
                2.0Labs<span className="text-emerald-500/60">_</span> Atlas
              </h1>
              <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">Research Canvas</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Reservoir Indicator - opens sidebar when clicked */}
            <ReservoirIndicator 
              documentCount={graphProject.documents.length}
              onClick={() => setIsGraphSidebarExpanded(true)}
            />
            <UserMenu />
          </div>
        </header>

        <div className="flex-1 flex pt-14">
          {/* Sidebar */}
          <div className={`transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
            isGraphSidebarExpanded ? 'w-64' : 'w-0'
          }`}>
            <div className={`h-full p-3 transition-opacity duration-300 ${
              isGraphSidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              <GraphSidebar 
                project={graphProject}
                onUpload={handleGraphFileUpload}
                isUploading={isGraphUploading}
              />
            </div>
          </div>
          
          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setIsGraphSidebarExpanded(!isGraphSidebarExpanded)}
            className={`absolute top-20 z-50 p-2 glass-surface border border-emerald-500/20 rounded-lg transition-all duration-300 hover:bg-emerald-500/10 ${
              isGraphSidebarExpanded 
                ? 'left-[256px] rounded-l-none' // Right edge of sidebar (256px = 64 * 4)
                : 'left-0 rounded-r-none' // Left edge when collapsed
            }`}
            title={isGraphSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isGraphSidebarExpanded ? (
              <PanelLeftClose className="w-4 h-4 text-slate-400 hover:text-emerald-400" />
            ) : (
              <PanelLeft className="w-4 h-4 text-slate-400 hover:text-emerald-400" />
            )}
          </button>
          
          {/* Canvas */}
          <main className="flex-1 relative">
            <GraphCanvas 
              project={graphProject}
              onUpdateProject={(updates) => setGraphProject(prev => ({ ...prev, ...updates }))}
            />
          </main>
        </div>
      </div>
    );
  }

  // Templates - Card selection view
  if (view === 'templates') {
    const driftClasses = ['idle-drift-1', 'idle-drift-2', 'idle-drift-3', 'idle-drift-4'];
    
    // Split templates into system and user templates
    const systemTemplates = templates.filter(t => t.is_system);
    const userTemplates = templates.filter(t => !t.is_system);
    
    return (
      <div className="landing-container h-screen w-full flex flex-col items-center justify-center bg-[#030a06] text-slate-300 p-6 font-['Epilogue'] relative overflow-hidden text-[12px]">
        {/* Grain overlay - independent motion */}
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
            Choose how you want to think. You can change this later.
          </p>
        </div>

        {templatesLoading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading templates...</span>
          </div>
        ) : (
          <>
            {/* System Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl w-full px-6 relative z-10">
              {systemTemplates.map((t, idx) => (
            <button
              key={t.id}
              onClick={() => selectTemplate(t)}
              className={`landing-card ${driftClasses[idx % 4]} glass-surface p-6 rounded-xl text-left flex flex-col min-h-[220px]`}
              style={{ '--card-delay': `${idx * 80}ms` } as React.CSSProperties}
            >
              <div className="landing-card-icon w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center mb-4 transition-all duration-500 shrink-0">
                    {t.metrics.length === 0 
                  ? <Plus className="w-3.5 h-3.5 text-emerald-400" /> 
                  : <Layers className="w-3.5 h-3.5 text-slate-400" />
                }
              </div>
              <h3 className="landing-card-title text-white text-[17px] font-light tracking-tight mb-1 leading-snug">
                {t.name}
              </h3>
              {t.subtitle && (
                <p className="landing-card-title text-[9px] uppercase tracking-[0.15em] text-emerald-500/60 font-semibold mb-2">
                  {t.subtitle}
                </p>
              )}
              <p className="landing-card-desc text-[12px] leading-relaxed text-slate-400 mb-4 font-light flex-1">
                {t.description}
              </p>
              <div className="landing-card-action mt-auto pt-2 flex items-center gap-1.5 text-emerald-500 text-[10px] uppercase tracking-[0.2em] font-semibold transition-opacity duration-500">
                Enter <ArrowRight className="w-3 h-3" />
              </div>
            </button>
          ))}
        </div>
            
            {/* User Templates Section */}
            <div className="w-full max-w-6xl px-6 mt-10 relative z-10">
              <h2 className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-semibold mb-4">
                Your Templates
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Create Template Card */}
                <button
                  onClick={() => openCreateModal()}
                  className="landing-card idle-drift-1 glass-surface p-6 rounded-xl text-left flex flex-col min-h-[180px] border-dashed border-2 border-white/10 hover:border-emerald-500/30"
                  style={{ '--card-delay': '0ms' } as React.CSSProperties}
                >
                  <div className="landing-card-icon w-7 h-7 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center mb-4 transition-all duration-500 shrink-0">
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <h3 className="landing-card-title text-white text-[17px] font-light tracking-tight mb-1 leading-snug">
                    Create Template
                  </h3>
                  <p className="landing-card-title text-[9px] uppercase tracking-[0.15em] text-emerald-500/60 font-semibold mb-2">
                    Custom Analysis
                  </p>
                  <p className="landing-card-desc text-[12px] leading-relaxed text-slate-400 mb-4 font-light flex-1">
                    Build your own analysis template with custom metrics and columns.
                  </p>
                  <div className="landing-card-action mt-auto pt-2 flex items-center gap-1.5 text-emerald-500 text-[10px] uppercase tracking-[0.2em] font-semibold transition-opacity duration-500">
                    Create <Plus className="w-3 h-3" />
                  </div>
                </button>
                
                {/* User's existing templates */}
                {userTemplates.map((t, idx) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    className={`landing-card ${driftClasses[(idx + 1) % 4]} glass-surface p-6 rounded-xl text-left flex flex-col min-h-[180px]`}
                    style={{ '--card-delay': `${(idx + 1) * 80}ms` } as React.CSSProperties}
                  >
                    <div className="landing-card-icon w-7 h-7 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center mb-4 transition-all duration-500 shrink-0">
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <h3 className="landing-card-title text-white text-[17px] font-light tracking-tight mb-1 leading-snug">
                      {t.name}
                    </h3>
                    {t.subtitle && (
                      <p className="landing-card-title text-[9px] uppercase tracking-[0.15em] text-emerald-500/60 font-semibold mb-2">
                        {t.subtitle}
                      </p>
                    )}
                    <p className="landing-card-desc text-[12px] leading-relaxed text-slate-400 mb-4 font-light flex-1">
                      {t.description || 'Custom template'}
                    </p>
                    <div className="landing-card-action mt-auto pt-2 flex items-center gap-1.5 text-emerald-500 text-[10px] uppercase tracking-[0.2em] font-semibold transition-opacity duration-500">
                      Enter <ArrowRight className="w-3 h-3" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        
        {/* Create Template Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="glass-surface rounded-2xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="p-6 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-light text-white tracking-tight">
                    {createTemplateForm.forkFromId ? 'Fork Template' : 'Create Template'}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {createTemplateForm.forkFromId 
                      ? 'Create a copy of an existing template with your modifications'
                      : 'Build a custom analysis template with your own metrics'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              {/* Modal Content */}
              <div className="p-6 overflow-y-auto flex-1 space-y-5">
                {/* Template Name */}
                <div>
                  <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold block mb-2">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={createTemplateForm.name}
                    onChange={(e) => setCreateTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., My Custom Analysis"
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                
                {/* Subtitle */}
                <div>
                  <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold block mb-2">
                    Subtitle
                  </label>
                  <input
                    type="text"
                    value={createTemplateForm.subtitle}
                    onChange={(e) => setCreateTemplateForm(prev => ({ ...prev, subtitle: e.target.value }))}
                    placeholder="e.g., Financial Analysis"
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
                
                {/* Description */}
                <div>
                  <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold block mb-2">
                    Description
                  </label>
                  <textarea
                    value={createTemplateForm.description}
                    onChange={(e) => setCreateTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this template is for..."
                    rows={2}
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-none"
                  />
                </div>
                
                {/* Metrics */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">
                      Metrics (Columns)
                    </label>
                    <button
                      onClick={addMetricToForm}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] uppercase tracking-wider font-semibold hover:bg-emerald-500/20 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Metric
                    </button>
                  </div>
                  
                  {createTemplateForm.metrics.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic py-4 text-center border border-dashed border-white/10 rounded-lg">
                      No metrics added yet. Add metrics or leave empty for auto-inference.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {createTemplateForm.metrics.map((metric, idx) => (
                        <div key={metric.id} className="flex gap-2 items-start p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={metric.label}
                              onChange={(e) => updateMetricInForm(idx, 'label', e.target.value)}
                              placeholder="Metric label"
                              className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500/50"
                            />
                            <input
                              type="text"
                              value={metric.description}
                              onChange={(e) => updateMetricInForm(idx, 'description', e.target.value)}
                              placeholder="Description (optional)"
                              className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-slate-300 placeholder-slate-600 text-[11px] focus:outline-none focus:border-emerald-500/50"
                            />
                          </div>
                          <button
                            onClick={() => removeMetricFromForm(idx)}
                            className="p-2 rounded-md hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Fork from template option */}
                {!createTemplateForm.forkFromId && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold block mb-2">
                      Or Fork From
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          openCreateModal(e.target.value);
                        }
                      }}
                      className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                    >
                      <option value="">Select a template to fork...</option>
                      {templates.filter(t => t.is_system).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              
              {/* Modal Footer */}
              <div className="p-6 border-t border-white/[0.06] flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 text-slate-300 text-sm hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTemplate}
                  disabled={!createTemplateForm.name.trim() || isCreatingTemplate}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-black text-sm font-semibold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isCreatingTemplate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      {createTemplateForm.forkFromId ? 'Fork Template' : 'Create Template'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Template view - show loading if activeTemplate not yet loaded
  if (view === 'template' && !activeTemplate) {
    return (
      <div className="flex h-screen w-full bg-[#030a06] items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading template...</span>
      </div>
    );
  }

  // Guard: if we're in template view but have no activeTemplate, redirect
  if (view === 'template' && !activeTemplate) {
    navigateTo('templates');
    return null;
  }

  return (
    <div className="flex h-screen w-full bg-[#030a06] p-3 gap-3 overflow-hidden text-slate-200 font-['Epilogue'] font-light selection:bg-emerald-500/20 text-[12px]">
      
      {/* Chat Panel */}
      {view === 'template' && activeTemplate && (
        <div className={`fixed right-3 top-3 bottom-3 z-40 transition-all duration-300 ${isChatOpen ? 'w-72' : 'w-0'}`}>
          <ChatPanel
            isOpen={isChatOpen}
            onToggle={() => setIsChatOpen(!isChatOpen)}
            matrixContext={getMatrixContext()}
            onCellHighlight={handleCellHighlight}
            onDocumentOpen={handleDocumentOpen}
            analyticalAnswer={selectedQuestion ? {
              question: selectedQuestion,
              answerSummary: answerSummary,
              visualization: visualization,
              isLoading: isLoadingAnswer,
            } : null}
            onClearAnalyticalAnswer={handleClearAnalyticalAnswer}
          />
        </div>
      )}
      
      {/* Sidebar - hidden when PDF viewer is open */}
      <div className={`flex flex-col gap-2 shrink-0 transition-all duration-300 ${previewDoc ? 'w-0 opacity-0 overflow-hidden' : isSidebarExpanded ? 'w-56' : 'w-12'}`}>
        {isSidebarExpanded ? (
          <div className="flex flex-col h-full gap-2">
            {/* Header with back button */}
            <div className="glass-surface p-3 rounded-xl border-none">
              <button onClick={() => navigateTo('templates')} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors group mb-2">
                <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-[11px] uppercase tracking-wider font-semibold">Library</span>
              </button>
              <div className="space-y-0.5">
                <h1 className="text-[15px] font-light tracking-tight text-white">2.0Labs<span className="text-emerald-500/50">_</span> Prism</h1>
                <p className="text-[9px] text-emerald-400 uppercase tracking-wider font-semibold truncate">{activeTemplate?.name || 'Loading...'}</p>
              </div>
            </div>
            
            {/* Reservoir Panel */}
            <div className="flex-1 min-h-0">
              <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
              <ReservoirPanel
                documents={documents}
                onUpload={handleFileUpload}
                isUploading={false}
                onPreview={(doc) => setPreviewDoc(doc as any)}
                onDelete={removeDoc}
              />
            </div>
          </div>
        ) : (
          <div className="glass-surface p-2.5 rounded-xl flex flex-col h-full border-none relative">
            <button onClick={() => navigateTo('templates')} className="flex items-center justify-center text-white/50 hover:text-white transition-colors mb-3 p-1.5">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
              {documents.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => setPreviewDoc(doc)}
                  className="w-full p-2 rounded-md border border-white/[0.04] hover:bg-white/[0.03] transition-all flex items-center justify-center"
                  title={doc.name}
                >
                  <FileText className="w-3.5 h-3.5 text-white/40" />
                </button>
              ))}
              <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full p-2 border border-dashed border-white/10 rounded-md text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition-all flex items-center justify-center"
                title="Ingest Data"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        
        {/* Collapse/Expand Toggle */}
        <button 
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className={`absolute top-20 z-10 w-5 h-5 bg-slate-800 border border-white/10 rounded-full flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition-all shadow-md ${
            isSidebarExpanded ? 'left-[220px]' : 'left-[44px]'
          }`}
        >
          {isSidebarExpanded ? <PanelLeftClose className="w-3 h-3" /> : <PanelLeft className="w-3 h-3" />}
        </button>
      </div>

      {/* PDF Viewer Panel - Left side when open */}
      {previewDoc && (
        <div className="w-[38%] shrink-0 flex flex-col h-full glass-surface rounded-lg border-none overflow-hidden transition-all duration-300">
          {/* PDF Panel Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] bg-slate-900/40 shrink-0">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-6 h-6 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                <FileText className="w-3 h-3 text-emerald-500" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[11px] text-white font-medium truncate">{previewDoc.name}</span>
                <span className="text-[8px] text-slate-500 uppercase tracking-wider">
                  {previewDoc.type || 'Document'} • {(previewDoc.size / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {previewDoc.type === 'application/pdf' && previewDoc.blobUrl && (
                <a 
                  href={previewDoc.blobUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md text-[8px] hover:bg-emerald-500/20 transition-colors flex items-center gap-1 uppercase tracking-wider font-medium"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  Open
                </a>
              )}
              <button 
                onClick={() => setPreviewDoc(null)}
                className="p-1 text-slate-500 hover:text-white hover:bg-white/10 rounded-md transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          
          {/* PDF Content - Scrollable */}
          <div className="flex-1 overflow-auto bg-slate-950/40 custom-scrollbar">
            {previewDoc.type === 'application/pdf' && previewDoc.blobUrl ? (
              <div className="p-3">
                <Document
                  file={previewDoc.blobUrl}
                  onLoadSuccess={({ numPages }) => {
                    setPdfNumPages(numPages);
                  }}
                  loading={
                    <div className="flex items-center justify-center gap-2 text-slate-400 py-12">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-[10px] uppercase tracking-wider">Loading...</span>
                    </div>
                  }
                  error={
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-12">
                      <FileText className="w-8 h-8 opacity-30" />
                      <span className="text-[10px]">Failed to load</span>
                    </div>
                  }
                  className="pdf-document flex flex-col items-center gap-2"
                >
                  {Array.from(new Array(pdfNumPages || 0), (_, index) => (
                    <div key={`page_${index + 1}`} className="mb-2">
                      <Page 
                        pageNumber={index + 1}
                        scale={pdfScale}
                        className="shadow-lg rounded-md overflow-hidden"
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                      />
                    </div>
                  ))}
                </Document>
                {/* Zoom controls floating at bottom */}
                <div className="sticky bottom-2 flex justify-center mt-2">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-900/95 backdrop-blur-sm border border-white/10 rounded-full shadow-md">
                    <button
                      onClick={() => setPdfScale(s => Math.max(0.5, s - 0.25))}
                      className="p-1 text-slate-400 hover:text-white transition-colors"
                    >
                      <ZoomOut className="w-3 h-3" />
                    </button>
                    <span className="text-[9px] text-slate-400 font-mono w-8 text-center">
                      {Math.round(pdfScale * 100)}%
                    </span>
                    <button
                      onClick={() => setPdfScale(s => Math.min(2, s + 0.25))}
                      className="p-1 text-slate-400 hover:text-white transition-colors"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ) : previewDoc.type?.startsWith('image/') && previewDoc.blobUrl ? (
              <div className="w-full h-full flex items-center justify-center p-3">
                <img 
                  src={previewDoc.blobUrl} 
                  alt={previewDoc.name}
                  className="max-w-full max-h-full object-contain rounded-md shadow-xl"
                />
              </div>
            ) : (
              <div className="p-3">
                <pre className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed bg-slate-900/40 p-3 rounded-lg border border-white/5">
                  {previewDoc.content}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Matrix Workspace */}
      <div className={`flex-1 flex flex-col gap-2 h-full min-w-0 transition-all duration-300 ${isChatOpen ? 'mr-[300px]' : ''}`}>
        <header className="glass-surface px-3 py-2 rounded-lg flex items-center justify-between shrink-0 border-none shadow-lg">
          <div className="flex items-center gap-3">
            <h2 className="text-[12px] font-medium text-white tracking-[0.08em] uppercase">Synthesis Engine</h2>
            <div className="flex items-center gap-2 text-slate-400">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3" />
                <span className="text-[11px] uppercase tracking-wider">{documents.length} Entities</span>
              </div>
              
              {/* Analytical Questions Glyph - appears only when matrix has real data */}
              <AnalyticalQuestionsGlyph
                isVisible={documents.length > 0 && Object.values(cells).some((c: CellData) => c.value && c.value !== '—' && c.value !== 'Fault' && !c.isLoading)}
                isOpen={isQuestionsDropdownOpen}
                isLoading={isLoadingQuestions}
                questions={analyticalQuestions}
                dropdownRef={questionsDropdownRef}
                onToggle={() => {
                  setIsQuestionsDropdownOpen(!isQuestionsDropdownOpen);
                  if (!isQuestionsDropdownOpen) {
                    fetchAnalyticalQuestions();
                  }
                }}
                onClose={() => setIsQuestionsDropdownOpen(false)}
                onSelectQuestion={handleQuestionSelect}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Add Column Button */}
            <button
              onClick={() => {
                if (!activeTemplate) return;
                const newMetric = { 
                  id: `metric-${Date.now()}`, 
                  label: 'New Column', 
                  description: '' 
                };
                setActiveTemplate({ 
                  ...activeTemplate, 
                  metrics: [...activeTemplate.metrics, newMetric] 
                });
              }}
              disabled={!activeTemplate}
              className="px-2.5 py-1.5 rounded-md text-[10px] uppercase tracking-[0.08em] font-medium transition-all flex items-center gap-1.5 border border-white/10 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Add new column"
            >
              <Plus className="w-3 h-3" />
              Column
            </button>

            {/* Hydrate Button */}
            <button 
              onClick={computeAll}
              disabled={isProcessing || documents.length === 0 || !activeTemplate || activeTemplate.metrics.length === 0}
              className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-[0.08em] font-bold transition-all flex items-center gap-1.5 border ${
                isProcessing || documents.length === 0 || !activeTemplate || activeTemplate.metrics.length === 0
                ? 'bg-slate-800/50 text-slate-500 border-slate-700/50 cursor-not-allowed'
                : 'bg-emerald-500 text-black border-emerald-400 hover:bg-emerald-400 shadow-md shadow-emerald-500/20 active:scale-[0.98]'
              }`}
            >
              {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 fill-current" />}
              Hydrate
            </button>
            
            {/* User Menu */}
            <UserMenu />
          </div>
        </header>

        <div className="flex-1 glass-surface rounded-lg overflow-hidden relative border-none shadow-xl">
          <div className="h-full overflow-auto custom-scrollbar">
            <table className="w-full border-separate border-spacing-0 text-[12px]">
              <thead>
                <tr className="sticky top-0 z-20 bg-[#030a06]/95 backdrop-blur-xl">
                  <th className="px-2.5 py-2 text-left w-40 border-b border-white/[0.06] font-semibold text-slate-400 text-[11px] uppercase tracking-[0.15em] group">
                      <div className="flex items-center justify-between">
                        <span>Entity</span>
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-all"
                          title="Add documents"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </th>
                  {(activeTemplate?.metrics || []).map((metric, idx) => (
                      <th 
                        key={metric.id} 
                      className="px-2.5 py-2 text-left min-w-[120px] max-w-[160px] border-b border-white/[0.06] border-l border-white/[0.03]"
                      >
                      <div className="flex flex-col gap-0">
                            <input
                              type="text"
                              value={metric.label}
                              onChange={(e) => {
                                if (!activeTemplate) return;
                                const newMetrics = [...activeTemplate.metrics];
                                newMetrics[idx] = { ...newMetrics[idx], label: e.target.value };
                                setActiveTemplate({ ...activeTemplate, metrics: newMetrics });
                              }}
                              className="text-slate-200 text-[13px] font-normal tracking-tight bg-transparent border-none outline-none focus:text-emerald-300 hover:text-emerald-300/80 transition-colors cursor-text w-full truncate"
                              title="Click to edit column name"
                            />
                            <span className="text-[10px] text-emerald-500/60 font-mono tracking-[0.1em] uppercase">P_{metric.id.split('-').pop()}</span>
                        </div>
                      </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                      <tr 
                        key={doc.id}
                        className="matrix-data-row group transition-all duration-200 hover:bg-white/[0.02]"
                      >
                        <td className="px-2.5 py-1.5 border-b border-white/[0.03]">
                          <span className="text-slate-200 text-[13px] font-normal truncate block max-w-[140px]">{doc.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.06em]">N_{doc.id}</span>
                    </td>
                    {(activeTemplate?.metrics || []).map((metric, metricIdx) => {
                      const cellId = `${doc.id}-${metric.id}`;
                      const cell = cells[cellId];
                          const isHighlighted = highlightedCell === cellId;
                          const isAnchor = anchorCellId === cellId;
                          
                          const handleCellClick = (e: React.MouseEvent) => {
                            if (cell?.value && cell.value !== 'Fault') {
                              // Cell interactions are independent of analytical lens
                              // The lens remains active until explicitly closed
                              
                              // Toggle: if same cell is clicked, close overlay; otherwise open
                              if (anchorCellId === cellId) {
                                setAnchorCellId(null);
                                setAnchorCellRect(null);
                                setReasoningExpanded(false);
                              } else {
                                // Get the cell element's bounding rect
                                const cellElement = e.currentTarget as HTMLElement;
                                const rect = cellElement.getBoundingClientRect();
                                setAnchorCellId(cellId);
                                setAnchorCellRect(rect);
                                setReasoningExpanded(false);
                              }
                            }
                          };
                          
                      return (
                            <td 
                              key={cellId} 
                              data-cell-id={cellId}
                              className={`px-2.5 py-1.5 border-l border-white/[0.03] border-b border-white/[0.03] relative transition-all duration-200 ${cell?.isLoading ? 'matrix-cell-loading bg-emerald-500/[0.02]' : ''} ${isHighlighted ? 'ring-1 ring-emerald-400 bg-emerald-500/15 shadow-[0_0_12px_rgba(52,211,153,0.3)] cell-highlight-pulse' : ''} ${isAnchor ? 'ring-1 ring-emerald-500/30 bg-emerald-500/[0.06]' : ''}`}
                            >
                              <div className="min-h-[1.25rem] flex flex-col justify-center">
                            {cell?.isLoading ? (
                                  <div className="signal-assembly">
                                    <div className="signal-segment"></div>
                                    <div className="signal-segment"></div>
                                    <div className="signal-segment"></div>
                                    <div className="signal-segment"></div>
                              </div>
                            ) : cell?.value ? (
                                  <div className="animate-float-up flex flex-col gap-1 relative group/cell">
                                {cell.value === 'Fault' ? (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="text-rose-400 text-[13px] font-mono">Error</span>
                                        <span className="text-[10px] text-rose-500/50 uppercase tracking-wider">Failed</span>
                                  </div>
                                ) : (
                                  <>
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 opacity-50">
                                            <div className={`w-1.5 h-1.5 rounded-full ${cell.confidence === 'High' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{cell.confidence}</span>
                                    </div>
                                        </div>
                                        <button 
                                          onClick={handleCellClick}
                                          className="text-left w-full"
                                        >
                                          <span className={`text-[13px] font-mono leading-snug selection:bg-emerald-500/30 line-clamp-2 transition-colors ${isAnchor ? 'text-emerald-300' : 'text-slate-100 hover:text-emerald-300'}`}>
                                            {cell.value}
                                          </span>
                                        </button>
                                  </>
                                )}
                              </div>
                            ) : (
                                  <button onClick={() => computeCell(doc.id, metric)} className="w-full opacity-0 group-hover:opacity-100 transition-all text-[11px] text-slate-600 hover:text-emerald-400 font-mono tracking-[0.1em] font-semibold">[ EXTRACT ]</button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expandable Ticker Console */}
        <div className="fixed bottom-3 left-3 z-50 w-full max-w-xs pointer-events-none">
          <div className={`glass-surface rounded-lg border border-emerald-500/20 shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-all duration-400 pointer-events-auto flex flex-col overflow-hidden ${isToastExpanded ? 'max-h-[240px]' : 'max-h-[32px]'}`}>
            {/* Top Bar (Current Message) */}
            <div className="h-[32px] shrink-0 flex items-center justify-between px-2.5">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${latestLog?.type === 'error' ? 'bg-rose-500' : latestLog?.type === 'success' ? 'bg-emerald-400' : 'bg-emerald-500/60'} animate-pulse`}></div>
                <div className="flex flex-col truncate">
                  <span className="text-[9px] font-mono text-slate-200 uppercase tracking-[0.04em] font-semibold truncate">
                    {latestLog?.message || 'System Idle'}
                  </span>
                  <span className="text-[7px] text-slate-500 font-mono uppercase tracking-wider">Telemetry</span>
                </div>
              </div>
              <button 
                onClick={() => setIsToastExpanded(!isToastExpanded)}
                className="ml-1.5 p-1 text-slate-500 hover:text-emerald-400 transition-colors"
              >
                {isToastExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>
            </div>

            {/* Expanded History */}
            {isToastExpanded && (
              <div className="flex-1 overflow-y-auto p-2.5 pt-2 custom-scrollbar border-t border-white/[0.04]">
                <div className="flex items-center gap-1.5 mb-3 text-[9px] font-semibold text-slate-500 uppercase tracking-[0.2em]">
                  <History className="w-3 h-3" /> Logs
                </div>
                <div className="space-y-2">
                  {logs.length > 0 ? logs.map(log => (
                    <div key={log.id} className="flex gap-2 items-start group animate-in slide-in-from-left-2 duration-200">
                      <span className="text-[8px] font-mono text-slate-600 shrink-0 pt-0.5">
                        {log.timestamp.toLocaleTimeString([], { hour12: false, fractionalSecondDigits: 1 } as any)}
                      </span>
                      <div className="flex flex-col gap-0">
                        <span className={`text-[10px] font-medium leading-tight ${log.type === 'error' ? 'text-rose-400' : log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {log.message}
                        </span>
                      </div>
                    </div>
                  )) : (
                    <p className="text-[9px] text-slate-600 italic">No logs recorded.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>


        {/* Cell Detail Overlay - Floating contextual panel */}
        {(() => {
          const data = getAnchorCellData();
          if (!data || !anchorCellRect) return null;
          return (
            <CellDetailOverlay
              cell={data.cell}
              metric={data.metric}
              document={data.doc}
              anchorRect={anchorCellRect}
          onClose={() => {
                setAnchorCellId(null);
                setAnchorCellRect(null);
                setReasoningExpanded(false);
              }}
              onOpenDocument={setPreviewDoc}
              reasoningExpanded={reasoningExpanded}
              onToggleReasoning={() => setReasoningExpanded(!reasoningExpanded)}
            />
          );
        })()}

      </div>
    </div>
  );
};

// Main App wrapper with AuthProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
