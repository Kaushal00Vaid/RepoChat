import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  listConversations,
  getMessages,
  renameConversation,
  deleteConversation,
  type ConversationSummary,
  type PersistedMessage,
  type Citation,
} from '../api/conversations'

// Types
interface RepoState {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  html_url: string
  language: string | null
  stargazers_count: number
  forks_count: number
  updated_at: string | null
  default_branch: string
}

interface JobStatus {
  job_id: string
  repo_full_name: string
  status: 'pending' | 'running' | 'done' | 'failed'
  total_chunks: number
  chunks_ingested: number
  error_message: string | null
  created_at: string
  updated_at: string
}

interface ChunkResult {
  file_path: string
  language: string
  start_line: number
  end_line: number
  content: string
  chunk_index: number
  rrf_score: number
}

// Generation types
interface HistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text?: string
  citations?: Citation[]
  isStreaming?: boolean
  model?: string
  error?: string
}

// constants
const SUPPORTED_LANGS = new Set(['Python', 'JavaScript', 'TypeScript'])
const POLL_INTERVAL_MS = 2000
const MAX_HISTORY_PAIRS = 6  // last 6 exchanges sent to backend

// Language colour map for syntax badge
const LANG_COLORS: Record<string, { bg: string; text: string }> = {
  python:     { bg: 'bg-blue-500/15',   text: 'text-blue-300' },
  javascript: { bg: 'bg-yellow-500/15', text: 'text-yellow-300' },
  typescript: { bg: 'bg-sky-500/15',    text: 'text-sky-300' },
}

// Sub-components

function StatBadge({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-400 text-sm">
      {icon}
      <span className="font-medium text-slate-300">{value}</span>
      <span className="text-slate-500 text-xs">{label}</span>
    </div>
  )
}

function LanguageDot({ language }: { language: string | null }) {
  const colors: Record<string, string> = {
    TypeScript: '#3b82f6',
    JavaScript: '#facc15',
    Python: '#93c5fd',
  }
  if (!language) return null
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: colors[language] ?? '#94a3b8' }}
      />
      <span className="text-sm font-medium text-slate-300">{language}</span>
    </span>
  )
}

function UnsupportedLanguageBanner({ language }: { language: string | null }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 flex gap-4 items-start">
      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-amber-300 mb-1">Language Not Supported</p>
        <p className="text-sm text-slate-400 leading-relaxed">
          RepoChat currently supports <span className="text-white font-medium">Python</span>,{' '}
          <span className="text-white font-medium">JavaScript</span>, and{' '}
          <span className="text-white font-medium">TypeScript</span> repositories.
          {language && (
            <> This repo's primary language is <span className="text-amber-400 font-medium">{language}</span>.</>
          )}
        </p>
      </div>
    </div>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 20
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0 -rotate-90">
      <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="4" />
      <circle
        cx="26" cy="26" r={r} fill="none"
        stroke="url(#ring-grad)" strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
      <defs>
        <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function IngestPanel({
  repo,
  onIngest,
  job,
  ingesting,
}: {
  repo: RepoState
  onIngest: () => void
  job: JobStatus | null
  ingesting: boolean
}) {
  const pct = job && job.total_chunks > 0
    ? Math.round((job.chunks_ingested / job.total_chunks) * 100)
    : 0

  // No job yet / previous job failed
  if (!job || job.status === 'failed') {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/3 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-white mb-0.5">Ingest Codebase</p>
            <p className="text-sm text-slate-400">
              Chunks your code with AST parsing, generates embeddings, and stores them in a vector database so you can chat with it.
            </p>
          </div>
        </div>

        {job?.status === 'failed' && job.error_message && (
          <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-3">
            <p className="text-xs text-red-400 font-medium mb-0.5">Previous ingestion failed</p>
            <p className="text-xs text-slate-500 break-words">{job.error_message}</p>
          </div>
        )}

        <button
          id="btn-ingest"
          onClick={onIngest}
          disabled={ingesting}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl px-5 py-3 transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/25 active:scale-[0.98] cursor-pointer"
        >
          {ingesting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Dispatching…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
              </svg>
              {job?.status === 'failed' ? 'Retry Ingestion' : 'Ingest Codebase'}
            </>
          )}
        </button>
      </div>
    )
  }

  // Pending
  if (job.status === 'pending') {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/3 p-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
          <span className="w-4 h-4 rounded-full border-2 border-violet-500/40 border-t-violet-400 animate-spin" />
        </div>
        <div>
          <p className="font-semibold text-white">Queued</p>
          <p className="text-sm text-slate-400">Waiting for the ingestion worker to pick up this job…</p>
        </div>
      </div>
    )
  }

  // Running
  if (job.status === 'running') {
    return (
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 space-y-4">
        <div className="flex items-center gap-4">
          <ProgressRing pct={pct} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between mb-2">
              <p className="font-semibold text-white">Ingesting…</p>
              <span className="text-sm font-mono text-violet-400">{pct}%</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {job.total_chunks > 0 && (
              <p className="text-xs text-slate-500 mt-1.5">
                {job.chunks_ingested.toLocaleString()} / {job.total_chunks.toLocaleString()} chunks embedded
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Parsing your code, generating embeddings via OpenRouter, and storing in Qdrant…
        </p>
      </div>
    )
  }

  // Done
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
        <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-emerald-300">Ready to Chat</p>
        <p className="text-sm text-slate-400 mt-0.5">
          {job.chunks_ingested.toLocaleString()} chunks indexed. You can now chat with this codebase.
        </p>
      </div>
    </div>
  )
}

// ── Streaming cursor ──────────────────────────────────────────────────────────

function StreamingCursor() {
  return (
    <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 align-middle animate-pulse" />
  )
}

// ── Model badge ───────────────────────────────────────────────────────────────

function ModelBadge({ model }: { model: string }) {
  const label = model === 'gpt-4o-mini' ? 'GPT-4o mini' : 'Gemini 2.5 Flash'
  const style = model === 'gpt-4o-mini'
    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${style}`}>
      <span className="w-1 h-1 rounded-full bg-current opacity-70" />
      {label}
    </span>
  )
}

// Code Chunk Card

function ChunkCard({ chunk, index }: { chunk: ChunkResult | Citation; index: number }) {
  const [expanded, setExpanded] = useState(index < 3)
  const langStyle = LANG_COLORS[chunk.language.toLowerCase()] ?? { bg: 'bg-slate-500/15', text: 'text-slate-300' }
  const citIndex = 'index' in chunk ? (chunk as Citation).index : index + 1

  return (
    <div className="rounded-xl border border-white/8 bg-[#111118] overflow-hidden transition-all duration-200">
      {/* Header — always visible */}
      <button
        id={`chunk-card-${citIndex}`}
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/3 transition-colors group"
      >
        {/* Rank badge */}
        <span className="shrink-0 w-6 h-6 rounded-md bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-[10px] font-bold text-violet-400">
          {citIndex}
        </span>

        {/* File path */}
        <span className="flex-1 min-w-0 font-mono text-xs text-slate-300 truncate">
          {chunk.file_path}
          <span className="text-slate-500 ml-1">:{chunk.start_line}–{chunk.end_line}</span>
        </span>

        {/* Language badge */}
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${langStyle.bg} ${langStyle.text}`}>
          {chunk.language}
        </span>

        {/* Chevron */}
        <svg
          className={`shrink-0 w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-all duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Code body */}
      {expanded && (
        <div className="border-t border-white/6">
          <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-words max-h-80 overflow-y-auto scrollbar-thin">
            <code>{chunk.content}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Assistant message with inline citation badges ─────────────────────────────

const CITATION_RE = /\[(\d+)\]/g

function AssistantMessage({ msg }: { msg: ChatMessage }) {
  const [expandedCitations, setExpandedCitations] = useState<Set<number>>(new Set())

  const toggleCitation = (idx: number) => {
    setExpandedCitations(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  // Parse text into segments: plain text or [N] citation markers
  const segments: Array<{ type: 'text'; value: string } | { type: 'cite'; index: number }> = []
  const text = msg.text ?? ''
  let last = 0
  let m: RegExpExecArray | null
  CITATION_RE.lastIndex = 0
  while ((m = CITATION_RE.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: 'text', value: text.slice(last, m.index) })
    segments.push({ type: 'cite', index: parseInt(m[1]) })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })

  const citationMap = new Map<number, Citation>(
    (msg.citations ?? []).map(c => [c.index, c])
  )

  return (
    <div className="w-full space-y-3">
      {/* Model badge + message bubble */}
      <div className="flex items-start gap-2">
        {/* AI avatar */}
        <div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center mt-0.5">
          <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Model badge row */}
          {msg.model && (
            <div className="flex items-center gap-2">
              <ModelBadge model={msg.model} />
            </div>
          )}

          {/* Answer text with citation badges */}
          <div className="text-sm text-slate-200 leading-relaxed">
            {segments.map((seg, i) => {
              if (seg.type === 'text') {
                return <span key={i}>{seg.value}</span>
              }
              const hasCitation = citationMap.has(seg.index)
              return (
                <button
                  key={i}
                  onClick={() => hasCitation && toggleCitation(seg.index)}
                  disabled={!hasCitation}
                  className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold mx-0.5 align-baseline transition-all duration-150 ${
                    hasCitation
                      ? 'bg-violet-500/20 border border-violet-500/40 text-violet-300 hover:bg-violet-500/35 hover:border-violet-400/60 cursor-pointer active:scale-95'
                      : 'bg-slate-500/15 border border-slate-500/20 text-slate-500 cursor-default'
                  }`}
                >
                  {seg.index}
                </button>
              )
            })}
            {msg.isStreaming && <StreamingCursor />}
          </div>
        </div>
      </div>

      {/* Expanded citation chunk cards */}
      {expandedCitations.size > 0 && (
        <div className="ml-9 space-y-2">
          <p className="text-[10px] text-slate-600 font-medium uppercase tracking-wider px-1">Sources</p>
          {Array.from(expandedCitations)
            .sort((a, b) => a - b)
            .map(idx => {
              const citation = citationMap.get(idx)
              if (!citation) return null
              return <ChunkCard key={idx} chunk={citation} index={idx - 1} />
            })}
        </div>
      )}

      {/* Citations summary bar */}
      {!msg.isStreaming && msg.citations && msg.citations.length > 0 && (
        <div className="ml-9 flex items-center gap-2 px-1">
          <div className="w-1 h-1 rounded-full bg-violet-500/60" />
          <span className="text-[10px] text-slate-600">
            {msg.citations.length} source{msg.citations.length !== 1 ? 's' : ''} cited · click badges to view
          </span>
        </div>
      )}
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function ThinkingSkeleton() {
  return (
    <div className="flex items-start gap-2 w-full">
      <div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/15 flex items-center justify-center animate-pulse">
        <svg className="w-3.5 h-3.5 text-violet-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      </div>
      <div className="flex-1 space-y-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-violet-500/50 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-violet-500/50 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-violet-500/50 animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="text-xs text-slate-600 ml-1">Generating answer…</span>
        </div>
      </div>
    </div>
  )
}

// ── Relative time helper ──────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Conversation Sidebar ──────────────────────────────────────────────────────

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  loadingConvId,
}: {
  conversations: ConversationSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  loadingConvId: string | null
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const startRename = (conv: ConversationSummary) => {
    setRenamingId(conv.id)
    setRenameValue(conv.title)
  }

  const commitRename = (id: string) => {
    const trimmed = renameValue.trim()
    if (trimmed) onRename(id, trimmed)
    setRenamingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* New Chat button */}
      <button
        id="btn-new-chat"
        onClick={onNewChat}
        className="flex items-center gap-2 w-full px-3 py-2.5 mb-3 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-sm font-medium transition-all duration-150 active:scale-[0.98] cursor-pointer"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        New Chat
      </button>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
        {conversations.length === 0 && (
          <p className="text-[11px] text-slate-600 text-center pt-4 px-2">No chats yet. Start one!</p>
        )}

        {conversations.map(conv => {
          const isActive = conv.id === activeId
          const isRenaming = renamingId === conv.id
          const isDeleting = deleteConfirmId === conv.id
          const isLoading = loadingConvId === conv.id

          return (
            <div
              key={conv.id}
              className={`group relative rounded-xl transition-all duration-150 ${
                isActive
                  ? 'bg-violet-500/15 border border-violet-500/25'
                  : 'hover:bg-white/4 border border-transparent'
              }`}
            >
              {isRenaming ? (
                <div className="px-3 py-2">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(conv.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    onBlur={() => commitRename(conv.id)}
                    className="w-full bg-white/8 border border-violet-500/40 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-violet-400"
                  />
                </div>
              ) : isDeleting ? (
                <div className="px-3 py-2 space-y-2">
                  <p className="text-[11px] text-slate-400">Delete this chat?</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { onDelete(conv.id); setDeleteConfirmId(null) }}
                      className="flex-1 text-[11px] px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="flex-1 text-[11px] px-2 py-1 rounded-lg bg-white/6 border border-white/10 text-slate-400 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => onSelect(conv.id)}
                  className="w-full text-left px-3 py-2.5 pr-16"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border border-violet-500/40 border-t-violet-400 animate-spin shrink-0" />
                      <span className="text-xs text-slate-500 truncate">Loading…</span>
                    </div>
                  ) : (
                    <>
                      <p className={`text-xs font-medium truncate ${isActive ? 'text-violet-200' : 'text-slate-300'}`}>
                        {conv.title}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {conv.message_count > 0
                          ? `${Math.floor(conv.message_count / 2)} turn${Math.floor(conv.message_count / 2) !== 1 ? 's' : ''} · `
                          : ''}
                        {relativeTime(conv.updated_at)}
                      </p>
                    </>
                  )}
                </button>
              )}

              {/* Action buttons — visible on hover when not in rename/delete mode */}
              {!isRenaming && !isDeleting && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                  <button
                    onClick={e => { e.stopPropagation(); startRename(conv) }}
                    title="Rename"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-colors cursor-pointer"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirmId(conv.id) }}
                    title="Delete"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

function ChatPanel({ repoFullName, owner, repo }: { repoFullName: string; owner: string; repo: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Conversations sidebar state
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingConvId, setLoadingConvId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false) // mobile toggle

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load conversations on mount and auto-select the most recent one
  useEffect(() => {
    let cancelled = false

    listConversations(owner, repo)
      .then(async (convs) => {
        if (cancelled) return
        setConversations(convs)

        // Auto-select the most recent conversation (index 0 — sorted by updated_at desc)
        if (convs.length > 0) {
          const firstId = convs[0].id
          setActiveConversationId(firstId)
          setLoadingConvId(firstId)
          try {
            const persisted = await getMessages(firstId)
            if (cancelled) return
            setMessages(persisted.map(p => ({
              id: p.id,
              role: p.role as 'user' | 'assistant',
              text: p.content,
              citations: p.citations ?? undefined,
              model: p.model ?? undefined,
            })))
            setHistory(persisted.map(p => ({
              role: p.role as 'user' | 'assistant',
              content: p.content,
            })))
          } catch {
            // silent — user sees empty chat for that conversation
          } finally {
            if (!cancelled) setLoadingConvId(null)
          }
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [owner, repo])


  // Load messages when switching conversations
  const selectConversation = useCallback(async (convId: string) => {
    if (convId === activeConversationId) return
    setLoadingConvId(convId)
    setMessages([])
    setHistory([])
    setActiveConversationId(convId)
    setSidebarOpen(false)
    try {
      const persisted = await getMessages(convId)
      // Hydrate messages and history from persisted data
      const hydratedMessages: ChatMessage[] = persisted.map(p => ({
        id: p.id,
        role: p.role,
        text: p.content,
        citations: p.citations ?? undefined,
        model: p.model ?? undefined,
      }))
      const hydratedHistory: HistoryEntry[] = persisted.map(p => ({
        role: p.role,
        content: p.content,
      }))
      setMessages(hydratedMessages)
      setHistory(hydratedHistory)
    } catch {
      // silent — user sees empty chat
    } finally {
      setLoadingConvId(null)
    }
  }, [activeConversationId])

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null)
    setMessages([])
    setHistory([])
    setSidebarOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleRename = useCallback(async (convId: string, title: string) => {
    try {
      await renameConversation(convId, title)
      setConversations(prev =>
        prev.map(c => c.id === convId ? { ...c, title } : c)
      )
    } catch {
      // silent
    }
  }, [])

  const handleDelete = useCallback(async (convId: string) => {
    try {
      await deleteConversation(convId)
      setConversations(prev => prev.filter(c => c.id !== convId))
      if (activeConversationId === convId) {
        setActiveConversationId(null)
        setMessages([])
        setHistory([])
      }
    } catch {
      // silent
    }
  }, [activeConversationId])

  const handleSend = useCallback(async () => {
    const q = query.trim()
    if (!q || loading) return

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: q }
    const assistantId = crypto.randomUUID()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setQuery('')
    setLoading(true)

    // Snapshot history for this call (before appending user turn)
    const historySnapshot = history.slice(-(MAX_HISTORY_PAIRS * 2))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_full_name: repoFullName,
          query: q,
          conversation_id: activeConversationId,  // null on first turn → lazy create
          history: historySnapshot,
          top_k: 20,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = data?.detail
        const errorText =
          typeof detail === 'string'
            ? detail
            : detail?.message ?? 'Something went wrong. Please try again.'
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, error: errorText, text: undefined }
              : m
          )
        )
        return
      }

      // SSE pump
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalText = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let event: Record<string, unknown>
          try {
            event = JSON.parse(raw)
          } catch {
            continue
          }

          if (event.type === 'meta') {
            const modelUsed = event.model as string
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, model: modelUsed } : m
              )
            )
          } else if (event.type === 'delta') {
            const chunk = event.content as string
            finalText += chunk
            const captured = finalText
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, text: captured } : m
              )
            )
          } else if (event.type === 'citations') {
            const citations = event.chunks as Citation[]
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, citations } : m
              )
            )
          } else if (event.type === 'conversation_id') {
            // Backend auto-created a new conversation — adopt its ID and refresh sidebar
            const newConvId = event.conversation_id as string
            setActiveConversationId(newConvId)
            // Refresh conversation list so the new entry appears in the sidebar
            listConversations(owner, repo)
              .then(setConversations)
              .catch(() => {})
          } else if (event.type === 'error') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, isStreaming: false, error: event.content as string, text: undefined }
                  : m
              )
            )
            return
          } else if (event.type === 'done') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, isStreaming: false } : m
              )
            )
            // Append to conversation history for next turn
            setHistory(prev => [
              ...prev,
              { role: 'user', content: q },
              { role: 'assistant', content: finalText },
            ])
            // Refresh sidebar to update turn count + recency
            listConversations(owner, repo)
              .then(setConversations)
              .catch(() => {})
          }
        }
      }
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, isStreaming: false, error: 'Network error. Please try again.', text: undefined }
            : m
        )
      )
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [query, loading, repoFullName, history, activeConversationId, owner, repo])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isEmpty = messages.length === 0
  const hasHistory = history.length > 0

  return (
    <div className="flex rounded-2xl border border-white/8 bg-white/2 overflow-hidden" style={{ minHeight: '520px' }}>

      {/* ── Sidebar (desktop: always visible, mobile: slide-in panel) ── */}
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div className={`
        flex-shrink-0 w-56 border-r border-white/6 flex flex-col p-3 gap-0
        sm:relative sm:translate-x-0 sm:flex sm:z-auto
        fixed inset-y-0 left-0 z-40 bg-[#0d0d13] transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
      `}>
        <div className="flex items-center gap-2 mb-3 pt-1">
          <div className="w-5 h-5 rounded-md bg-violet-500/20 border border-violet-500/20 flex items-center justify-center shrink-0">
            <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Chats</span>
          {/* Mobile close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto sm:hidden text-slate-500 hover:text-slate-300 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={selectConversation}
          onNewChat={handleNewChat}
          onRename={handleRename}
          onDelete={handleDelete}
          loadingConvId={loadingConvId}
        />
      </div>

      {/* ── Main chat area ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Panel header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/6">
          <div className="flex items-center gap-3">
            {/* Mobile sidebar toggle */}
            <button
              id="btn-sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              className="sm:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/6 transition-colors cursor-pointer"
              aria-label="Open chats"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Chat with Codebase</p>
              <p className="text-[11px] text-slate-500">Conversational AI · GPT-4o-mini · Sources cited inline</p>
            </div>
          </div>
          {/* Turn counter */}
          {hasHistory && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-white/4 border border-white/8 rounded-full px-2.5 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {Math.floor(history.length / 2)} turn{Math.floor(history.length / 2) !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Message thread */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-[200px] max-h-[600px]">
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <span className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              <p className="text-xs text-slate-600">Loading conversation…</p>
            </div>
          ) : isEmpty && !loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/8 border border-violet-500/15 flex items-center justify-center">
                <svg className="w-6 h-6 text-violet-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-400">Ask anything about this codebase</p>
                <p className="text-xs text-slate-600 mt-1">
                  e.g. "How does authentication work?" · "Where is rate limiting handled?"
                </p>
              </div>
            </div>
          ) : null}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}
            >
              {msg.role === 'user' ? (
                /* User bubble */
                <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-violet-600/20 border border-violet-500/20">
                  <p className="text-sm text-slate-200 leading-relaxed">{msg.text}</p>
                </div>
              ) : msg.error ? (
                /* Error bubble */
                <div className="w-full flex items-start gap-2 px-4 py-3 rounded-2xl rounded-tl-sm bg-red-500/8 border border-red-500/15">
                  <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <p className="text-sm text-red-300">{msg.error}</p>
                </div>
              ) : msg.isStreaming && !msg.text ? (
                /* Pre-text thinking animation */
                <div className="w-full">
                  <ThinkingSkeleton />
                </div>
              ) : (
                /* Assistant answer with citations */
                <div className="w-full">
                  <AssistantMessage msg={msg} />
                </div>
              )}
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-white/6 p-4">
          <div className="flex items-center gap-2 rounded-xl bg-white/4 border border-white/8 px-4 py-2.5 focus-within:border-violet-500/40 focus-within:bg-white/5 transition-all duration-200">
            <input
              id="chat-query-input"
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about this codebase…"
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none disabled:opacity-50"
            />
            <button
              id="chat-send-btn"
              onClick={handleSend}
              disabled={loading || !query.trim()}
              className="shrink-0 w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer"
            >
              {loading ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-700 mt-2 text-center">
            Enter to send · Citations shown inline · {hasHistory ? `${Math.floor(history.length / 2)}-turn conversation` : 'Stateful conversation'}
          </p>
        </div>
      </div>
    </div>
  )
}

// Main Page

export default function RepoDetailPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  // Repo data may come from route state (instant) or need fetching
  const [repoData, setRepoData] = useState<RepoState | null>(
    (location.state as { repo?: RepoState } | null)?.repo ?? null
  )

  const [job, setJob] = useState<JobStatus | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [ingesting, setIngesting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true })
  }, [authLoading, user, navigate])

  // Show toast helper
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  // Fetch repo data if not in route state
  useEffect(() => {
    if (repoData || !owner || !repo) return
    fetch(`/api/repos?per_page=100`, { credentials: 'include' })
      .then((r) => r.json())
      .then((repos: RepoState[]) => {
        const found = repos.find((r) => r.full_name === `${owner}/${repo}`)
        if (found) setRepoData(found)
      })
      .catch(() => {})
  }, [repoData, owner, repo])

  // Poll job status
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ingest/${id}/status`, { credentials: 'include' })
        if (!res.ok) return
        const data: JobStatus = await res.json()
        setJob(data)
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(pollRef.current!)
          pollRef.current = null
        }
      } catch { /* silent */ }
    }, POLL_INTERVAL_MS)
  }, [])

  // On mount: fetch the latest job for this repo so the UI reflects existing state
  useEffect(() => {
    if (!owner || !repo || !user) return
    fetch(`/api/ingest/${owner}/${repo}/latest`, { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 404) return // no prior job
        if (!res.ok) return
        const data: JobStatus = await res.json()
        setJob(data)
        setJobId(data.job_id)
        // Resume polling if still in progress
        if (data.status === 'pending' || data.status === 'running') {
          startPolling(data.job_id)
        }
      })
      .catch(() => {})
  }, [owner, repo, user, startPolling])

  useEffect(() => {
    if (jobId) startPolling(jobId)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobId, startPolling])

  // Trigger ingestion
  const handleIngest = async () => {
    if (!owner || !repo) return
    setIngesting(true)
    try {
      const res = await fetch(`/api/ingest/${owner}/${repo}`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()

      if (!res.ok) {
        const detail = data?.detail
        // Language gate error
        if (detail?.code === 'unsupported_language') {
          showToast(detail.message)
          return
        }
        // Already ingested — surface the existing done job
        if (detail?.code === 'already_ingested') {
          setJob({
            job_id: detail.job_id,
            repo_full_name: `${owner}/${repo}`,
            status: 'done',
            total_chunks: detail.chunks_ingested,
            chunks_ingested: detail.chunks_ingested,
            error_message: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          showToast('This repository is already ingested and ready to chat.')
          return
        }
        showToast(detail?.message ?? detail ?? 'Failed to start ingestion.')
        return
      }

      setJobId(data.job_id)
      setJob({
        job_id: data.job_id,
        repo_full_name: `${owner}/${repo}`,
        status: data.status,
        total_chunks: 0,
        chunks_ingested: 0,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    } catch {
      showToast('Network error. Please try again.')
    } finally {
      setIngesting(false)
    }
  }

  // Render
  if (authLoading || !repoData) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  const isSupported = SUPPORTED_LANGS.has(repoData.language ?? '')
  const updatedDate = repoData.updated_at
    ? new Date(repoData.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-[#0a0a0f] pt-14">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-20 left-1/4 w-[500px] h-[400px] bg-violet-600/6 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-[400px] h-[300px] bg-indigo-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 py-12 space-y-8">
        {/* Back button */}
        <Link
          to="/repositories"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          All Repositories
        </Link>

        {/* Repo header card */}
        <div className="rounded-2xl border border-white/8 bg-white/3 p-6 space-y-4">
          {/* Name + visibility */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white truncate">{repoData.name}</h1>
                <p className="text-xs text-slate-500">{owner}</p>
              </div>
            </div>
            <span className={`shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full border ${
              repoData.private
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
            }`}>
              {repoData.private ? 'Private' : 'Public'}
            </span>
          </div>

          {repoData.description && (
            <p className="text-sm text-slate-400 leading-relaxed">{repoData.description}</p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 pt-1">
            <LanguageDot language={repoData.language} />
            {repoData.stargazers_count > 0 && (
              <StatBadge
                icon={<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>}
                value={repoData.stargazers_count.toLocaleString()}
                label="stars"
              />
            )}
            {repoData.forks_count > 0 && (
              <StatBadge
                icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m-6 3.75l3 3m0 0l3-3m-3 3V1.5m6 9h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" /></svg>}
                value={repoData.forks_count.toLocaleString()}
                label="forks"
              />
            )}
            {updatedDate && (
              <span className="text-xs text-slate-600 flex items-center">Updated {updatedDate}</span>
            )}
            <a
              href={repoData.html_url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              View on GitHub
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        </div>

        {/* Ingest section */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">Ingestion</h2>
          {isSupported ? (
            <IngestPanel repo={repoData} onIngest={handleIngest} job={job} ingesting={ingesting} />
          ) : (
            <UnsupportedLanguageBanner language={repoData.language} />
          )}
        </div>

        {/* Chat / Retrieval section — only shown when ingestion is done */}
        {job?.status === 'done' && repoData.full_name && owner && repo && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">Chat</h2>
            <ChatPanel repoFullName={repoData.full_name} owner={owner} repo={repo} />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-3 bg-[#1c1c27] border border-white/10 rounded-xl px-4 py-3 shadow-xl shadow-black/40 max-w-sm">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-slate-300">{toast}</p>
          </div>
        </div>
      )}
    </div>
  )
}
