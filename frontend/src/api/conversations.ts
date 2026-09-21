/**
 * Typed API helpers for the /api/conversations endpoints.
 * All functions throw on non-ok responses.
 */

export interface ConversationSummary {
  id: string
  title: string
  repo_full_name: string
  message_count: number
  created_at: string
  updated_at: string
}

export interface ConversationDetail {
  id: string
  title: string
  repo_full_name: string
  created_at: string
  updated_at: string
}

export interface Citation {
  index: number
  file_path: string
  language: string
  start_line: number
  end_line: number
  content: string
  rrf_score: number
}

export interface PersistedMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  model: string | null
  citations: Citation[] | null
  created_at: string
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * List all conversations for a repo, most-recent first.
 * GET /api/conversations?owner={owner}&repo={repo}
 */
export function listConversations(owner: string, repo: string): Promise<ConversationSummary[]> {
  return apiFetch(`/api/conversations/?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`)
}

/**
 * Create a new blank conversation for the given repo.
 * POST /api/conversations/  body: { repo_full_name }
 */
export function createConversation(repoFullName: string): Promise<ConversationDetail> {
  return apiFetch(`/api/conversations/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_full_name: repoFullName }),
  })
}

/**
 * Fetch all persisted messages for a conversation (asc order).
 * GET /api/conversations/{id}/messages
 */
export function getMessages(conversationId: string): Promise<PersistedMessage[]> {
  return apiFetch(`/api/conversations/${conversationId}/messages`)
}

/** Rename a conversation. */
export function renameConversation(conversationId: string, title: string): Promise<ConversationDetail> {
  return apiFetch(`/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

/** Delete a conversation and all its messages. */
export function deleteConversation(conversationId: string): Promise<void> {
  return apiFetch(`/api/conversations/${conversationId}`, { method: 'DELETE' })
}
