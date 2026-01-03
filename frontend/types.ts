
export interface Document {
  id: string;
  name: string;
  type: string;
  content: string;
  size: number;
  blobUrl?: string;
}

export interface Metric {
  id: string;
  label: string;
  description?: string;
  type?: 'numeric' | 'qualitative' | 'binary';
}

export interface Template {
  id: string;
  name: string;
  subtitle?: string;
  description?: string;
  metrics: Metric[];
  user_id?: string | null;
  is_system?: boolean;
  forked_from_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CellData {
  value: string | null;
  isLoading: boolean;
  confidence?: 'High' | 'Medium' | 'Exploratory';
  reasoning?: string;
  sources?: string[];
  error?: string;
}

export interface ActivityLog {
  id: string;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'process';
}

// Graph View Types
export interface GraphNode {
  id: string;
  title: string;
  content: string[];
  color: 'yellow' | 'red' | 'blue' | 'green' | 'slate' | 'orange';
  position: { x: number; y: number };
  width?: number;
  height?: number;
  parentId?: string;
  query?: string;
  connectedTo: string[];
  pendingMerge?: {
    sourceNodeId: string;
    targetNodeId: string;
    suggestions: string[];
    isLoadingSuggestions: boolean;
  };
}

export interface GraphProject {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  documents: Document[];
  nodes: GraphNode[];
}
