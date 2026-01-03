
import { GraphNode, Document } from '../types';

// Use the same API base URL pattern as the main api.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

type NodeColor = 'yellow' | 'red' | 'blue' | 'green' | 'slate';

interface NodeData {
  title: string;
  content: string[];
  color: NodeColor;
}

interface GenerateGraphResponse {
  nodes: NodeData[];
}

interface ExpandNodeResponse {
  nodes: NodeData[];
}

interface MergeNodesResponse {
  node: NodeData;
}

interface CreateNodeResponse {
  node: NodeData;
}

// Helper to get auth token
const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

/**
 * Generate a research graph from a query and document context
 */
export const generateGraph = async (
  query: string,
  docs: Document[]
): Promise<GenerateGraphResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/graph/generate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      query,
      documents: docs.map(d => ({
        name: d.name,
        content: d.content
      }))
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to generate graph: ${error}`);
  }

  return response.json();
};

/**
 * Expand a node into sub-nodes based on document context
 */
export const expandNode = async (
  node: GraphNode,
  docs: Document[],
  query?: string
): Promise<ExpandNodeResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/graph/expand`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      node: {
        title: node.title,
        content: node.content
      },
      documents: docs.map(d => ({
        name: d.name,
        content: d.content
      })),
      query
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to expand node: ${error}`);
  }

  return response.json();
};

/**
 * Merge multiple nodes into a synthesized summary node
 */
export const mergeNodes = async (
  nodes: GraphNode[]
): Promise<MergeNodesResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/graph/merge`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      nodes: nodes.map(n => ({
        title: n.title,
        content: n.content
      }))
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to merge nodes: ${error}`);
  }

  return response.json();
};

/**
 * Create a new node from a custom prompt
 */
export const createNode = async (
  prompt: string,
  parentNode: GraphNode | null,
  docs: Document[]
): Promise<CreateNodeResponse> => {
  const response = await fetch(`${API_BASE_URL}/api/graph/create`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      prompt,
      parent_node: parentNode ? {
        title: parentNode.title,
        content: parentNode.content
      } : null,
      documents: docs.map(d => ({
        name: d.name,
        content: d.content
      }))
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create node: ${error}`);
  }

  return response.json();
};

/**
 * Stream node data for SSE event
 */
interface StreamNodeEvent {
  type: 'node' | 'done' | 'error';
  data?: NodeData | { message: string };
  index?: number;
  total?: number;
}

/**
 * Generate graph nodes via SSE streaming
 * Nodes are yielded one at a time as they're generated
 */
export const generateGraphStream = async (
  query: string,
  docs: Document[],
  onNode: (node: NodeData, index: number, total: number) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/graph/generate/stream`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      query,
      documents: docs.map(d => ({
        name: d.name,
        content: d.content
      }))
    })
  });

  if (!response.ok) {
    const error = await response.text();
    onError(`Failed to generate graph: ${error}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event: StreamNodeEvent = JSON.parse(jsonStr);

            if (event.type === 'node' && event.data) {
              onNode(event.data as NodeData, event.index || 0, event.total || 1);
            } else if (event.type === 'done') {
              onDone();
            } else if (event.type === 'error') {
              onError((event.data as { message: string })?.message || 'Unknown error');
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE event:', jsonStr);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

/**
 * Generate AI suggestions for how to expand a specific node
 */
export const suggestExpand = async (
  node: GraphNode,
  docs: Document[]
): Promise<{ suggestions: string[] }> => {
  const response = await fetch(`${API_BASE_URL}/api/graph/suggest-expand`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      node: {
        title: node.title,
        content: node.content
      },
      documents: docs.map(d => ({
        name: d.name,
        content: d.content
      }))
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get expand suggestions: ${error}`);
  }

  return response.json();
};

// Export all functions as a namespace
export const graphApi = {
  generateGraph,
  generateGraphStream,
  expandNode,
  mergeNodes,
  createNode,
  suggestExpand
};

export default graphApi;

