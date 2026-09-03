import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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

// constants
const SUPPORTED_LANGS = new Set(['Python', 'JavaScript', 'TypeScript'])
const POLL_INTERVAL_MS = 2000

// sub-components
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

      <div className="relative mx-auto max-w-2xl px-6 py-12 space-y-8">
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
