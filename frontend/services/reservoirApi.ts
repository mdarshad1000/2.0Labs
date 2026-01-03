/**
 * Reservoir API Service
 * 
 * The Reservoir is the document substrate that powers all thinking modes.
 * Documents ingested here are available across Prism (matrix) and Atlas (graph).
 * 
 * Design principle: "Reservoir should feel like gravity — always present, 
 * never interacted with directly unless needed."
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ============================================================================
// Types
// ============================================================================

export interface ReservoirDocument {
  id: string;
  name: string;
  original_filename: string;
  file_type: string;
  file_size: string | null;
  file_size_bytes: string | null;
  is_processed: boolean;
  created_at: string;
}

export interface ReservoirDocumentDetail extends ReservoirDocument {
  extracted_text: string | null;
}

export interface ReservoirListResponse {
  documents: ReservoirDocument[];
  total: number;
}

export interface IngestResponse {
  id: string;
  name: string;
  file_type: string;
  file_size: string;
  is_processed: boolean;
  message: string;
}

export interface IngestMultipleResponse {
  documents: IngestResponse[];
  total_ingested: number;
  total_failed: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * List all documents in the user's Reservoir.
 * Returns documents sorted by creation date (newest first).
 */
export async function listReservoirDocuments(): Promise<ReservoirListResponse> {
  const response = await fetch(`${API_BASE_URL}/api/reservoir`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch documents' }));
    throw new Error(error.detail || 'Failed to fetch documents');
  }

  return response.json();
}

/**
 * Get a specific document with its extracted content.
 */
export async function getReservoirDocument(documentId: string): Promise<ReservoirDocumentDetail> {
  const response = await fetch(`${API_BASE_URL}/api/reservoir/${documentId}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Document not found' }));
    throw new Error(error.detail || 'Document not found');
  }

  return response.json();
}

/**
 * Ingest a single document into the Reservoir.
 * Extracts text content and handles deduplication.
 */
export async function ingestDocument(file: File): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/reservoir/ingest`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to ingest document' }));
    throw new Error(error.detail || 'Failed to ingest document');
  }

  return response.json();
}

/**
 * Ingest multiple documents into the Reservoir.
 */
export async function ingestMultipleDocuments(files: FileList | File[]): Promise<IngestMultipleResponse> {
  const formData = new FormData();
  
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  const response = await fetch(`${API_BASE_URL}/api/reservoir/ingest-multiple`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to ingest documents' }));
    throw new Error(error.detail || 'Failed to ingest documents');
  }

  return response.json();
}

/**
 * Delete a document from the Reservoir.
 */
export async function deleteReservoirDocument(documentId: string): Promise<{ message: string; id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/reservoir/${documentId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to delete document' }));
    throw new Error(error.detail || 'Failed to delete document');
  }

  return response.json();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert a ReservoirDocument to a format compatible with existing Document type.
 * This allows seamless integration with existing components.
 */
export function toLocalDocument(doc: ReservoirDocument | ReservoirDocumentDetail): {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
} {
  return {
    id: doc.id,
    name: doc.name,
    type: doc.file_type,
    size: parseInt(doc.file_size_bytes || '0', 10),
    content: 'extracted_text' in doc ? (doc.extracted_text || '') : '',
  };
}

