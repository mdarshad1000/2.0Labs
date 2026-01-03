// In development, use relative paths (Vite proxy handles forwarding to backend)
// In production, use the full API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const API_BASE = `${API_BASE_URL}/api`;

// ============= AUTH TYPES =============

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  is_active: boolean;
  is_admin: boolean;
  is_email_verified: boolean;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
  newly_created?: boolean;
  redirectUrl?: string;
}

// ============= API TYPES =============

export interface ExtractionResult {
  value: string;
  reasoning: string;
  confidence: 'High' | 'Medium' | 'Exploratory';
  sources: string[];
}

export interface CellCitation {
  type: 'cell';
  index: number;
  doc_id: string;
  doc_name: string;
  metric_id: string;
  metric_label: string;
  value: string;
}

export interface DocumentCitation {
  type: 'document';
  index: number;
  doc_id: string;
  doc_name: string;
  section?: string;
  page?: number;
  excerpt: string;
}

export type Citation = CellCitation | DocumentCitation;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
}

export interface ChatResponse {
  message: ChatMessage;
  matrix_cells_used: number;
  documents_searched: number;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface MatrixContext {
  documents: Array<{
    id: string;
    name: string;
    type: string;
    content: string;
    size: number;
    blobUrl?: string;
  }>;
  metrics: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  cells: Record<string, {
    value: string | null;
    isLoading: boolean;
    confidence?: string;
    reasoning?: string;
    sources?: string[];
    error?: string;
  }>;
}

// ============= ANALYTICAL QUESTIONS TYPES =============

export interface AnalyticalQuestion {
  id: string;
  question: string;
  intent: 'COMPARISON' | 'TREND' | 'ANOMALY' | 'RELATIONSHIP' | 'DISTRIBUTION';
  metrics_involved: string[];
  entities_involved: string[];
  visualization_hint?: string;
}

export interface QuestionsResponse {
  questions: AnalyticalQuestion[];
}

export interface VisualizationSpec {
  type: string;
  title: string;
  x_axis?: { label: string; values?: string[] };
  y_axis?: { label: string; unit?: string };
  data: Array<{ label: string; value: number; highlight?: boolean }>;
  insight?: string;
}

export interface AnswerResponse {
  answer_summary: string;
  visualization?: VisualizationSpec;
  error?: string;
}

// ============= TEMPLATE TYPES =============

export interface TemplateMetric {
  id: string;
  label: string;
  description?: string;
  type?: 'numeric' | 'qualitative' | 'binary';
}

export interface TemplateData {
  id: string;
  name: string;
  subtitle?: string;
  description?: string;
  metrics: TemplateMetric[];
  user_id?: string | null;
  is_system?: boolean;
  forked_from_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TemplateListResponse {
  templates: TemplateData[];
}

export interface TemplateCreateRequest {
  name: string;
  subtitle?: string;
  description?: string;
  metrics?: TemplateMetric[];
}

export interface TemplateForkRequest {
  name?: string;
}

export interface TemplateUpdateRequest {
  name?: string;
  subtitle?: string;
  description?: string;
  metrics?: TemplateMetric[];
}

export interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  error?: string;
}

/**
 * Generic fetch wrapper that includes credentials for cookie handling.
 */
async function fetchFromApi(endpoint: string, options: RequestInit = {}): Promise<any> {
  const headers: HeadersInit = {};

  // Only set Content-Type to application/json if we're not sending FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // In dev, API_BASE_URL is empty so this becomes just the endpoint path
  // which Vite's proxy will forward to the backend
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
    credentials: 'include', // Include cookies for auth
  });

  if (!response.ok) {
    let errorMessage: unknown = `API error: ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch {
      // If we can't parse the error response, fall back to status text
      errorMessage = `API error: ${response.status} ${response.statusText}`;
    }

    if (typeof errorMessage !== 'string') {
      errorMessage = JSON.stringify(errorMessage);
    }

    throw new Error(errorMessage as string);
  }

  if (response.status === 204) {
    return null; // No content to return
  }

  return response.json();
}

// Export the fetch helper for use in auth context
export { fetchFromApi };

class ApiService {
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============= AUTH API =============

  async getMe(): Promise<AuthResponse> {
    return fetchFromApi('/api/auth/me');
  }

  async logout(allDevices: boolean = false): Promise<AuthResponse> {
    return fetchFromApi(`/api/auth/logout?all_devices=${allDevices}`);
  }

  async getGoogleAuthUrl(): Promise<{ auth_url: string }> {
    return fetchFromApi('/api/auth/google/login');
  }

  async emailSignIn(email: string): Promise<AuthResponse> {
    return fetchFromApi('/api/auth/email/signin', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async emailSetName(email: string, name: string): Promise<AuthResponse> {
    return fetchFromApi('/api/auth/email/fullname', {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    });
  }

  async emailVerify(email: string, code: string): Promise<AuthResponse> {
    return fetchFromApi('/api/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  }

  // ============= EXISTING API METHODS =============

  async extract(docContent: string, metricLabel: string): Promise<ExtractionResult> {
    const response = await fetch(`${API_BASE}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        doc_content: docContent,
        metric_label: metricLabel,
      }),
    });

    if (!response.ok) {
      throw new Error(`Extraction failed: ${response.statusText}`);
    }

    return response.json();
  }

  async inferSchema(docSnippets: Array<{ name: string; content: string }>): Promise<string[]> {
    const response = await fetch(`${API_BASE}/infer-schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        doc_snippets: docSnippets,
      }),
    });

    if (!response.ok) {
      throw new Error(`Schema inference failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.metrics;
  }

  async chat(query: string, matrixContext: MatrixContext): Promise<ChatResponse> {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        query,
        session_id: this.sessionId,
        matrix_context: matrixContext,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat failed: ${response.statusText}`);
    }

    return response.json();
  }

  async chatStream(
    query: string, 
    matrixContext: MatrixContext,
    onText: (text: string) => void,
    onCitations: (citations: Citation[]) => void,
    onDone: (messageId: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        query,
        session_id: this.sessionId,
        matrix_context: matrixContext,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat stream failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'text') {
              onText(data.content);
            } else if (data.type === 'citations') {
              onCitations(data.citations || []);
            } else if (data.type === 'done') {
              onDone(data.message_id);
            } else if (data.type === 'error') {
              onError(data.error);
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }
  }

  async clearChatHistory(): Promise<void> {
    await fetch(`${API_BASE}/chat/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ session_id: this.sessionId }),
    });
  }

  resetSession(): void {
    this.sessionId = this.generateSessionId();
  }

  async uploadDocument(file: File): Promise<UploadedDocument> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  async uploadMultipleDocuments(files: File[]): Promise<{ documents: UploadedDocument[] }> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const response = await fetch(`${API_BASE}/upload-multiple`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  // ============= ANALYTICAL QUESTIONS API =============

  async getAnalyticalQuestions(matrixContext: MatrixContext): Promise<QuestionsResponse> {
    const response = await fetch(`${API_BASE}/analytical-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        documents: matrixContext.documents.map(d => ({ id: d.id, name: d.name })),
        metrics: matrixContext.metrics,
        cells: matrixContext.cells,
      }),
    });

    if (!response.ok) {
      throw new Error(`Question generation failed: ${response.statusText}`);
    }

    return response.json();
  }

  async answerQuestion(
    question: AnalyticalQuestion,
    matrixContext: MatrixContext
  ): Promise<AnswerResponse> {
    const response = await fetch(`${API_BASE}/answer-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        question,
        documents: matrixContext.documents.map(d => ({ id: d.id, name: d.name })),
        metrics: matrixContext.metrics,
        cells: matrixContext.cells,
      }),
    });

    if (!response.ok) {
      throw new Error(`Answer generation failed: ${response.statusText}`);
    }

    return response.json();
  }

  // ============= TEMPLATE API =============

  async getTemplates(): Promise<TemplateListResponse> {
    return fetchFromApi('/api/templates');
  }

  async getTemplate(id: string): Promise<TemplateData> {
    return fetchFromApi(`/api/templates/${id}`);
  }

  async createTemplate(data: TemplateCreateRequest): Promise<TemplateData> {
    return fetchFromApi('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async forkTemplate(id: string, data?: TemplateForkRequest): Promise<TemplateData> {
    return fetchFromApi(`/api/templates/${id}/fork`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async updateTemplate(id: string, data: TemplateUpdateRequest): Promise<TemplateData> {
    return fetchFromApi(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTemplate(id: string): Promise<void> {
    return fetchFromApi(`/api/templates/${id}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiService();

