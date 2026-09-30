import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { RepoHeader } from '@/components/repo/RepoCard'
import { IngestPanel, UnsupportedLanguageBanner } from '@/components/repo/IngestPanel'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { ToastContainer } from '@/components/shared/Toast'
import { FullPageSpinner } from '@/components/shared/LoadingSpinner'
import { ArrowLeft, Database, MessageSquare } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// Constants

const SUPPORTED_LANGS = new Set(['Python', 'JavaScript', 'TypeScript'])
const POLL_INTERVAL_MS = 2000

// Section heading

function SectionHeading({ icon: Icon, label }: { icon: React.FC<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</h2>
    </div>
  )
}

// Main Page

export default function RepoDetailPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

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

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }, [])

  // Fetch repo data if not in route state
  useEffect(() => {
    if (repoData || !owner || !repo) return
    fetch(`/api/repos?per_page=100`, { credentials: 'include' })
      .then(r => r.json())
      .then((repos: RepoState[]) => {
        const found = repos.find(r => r.full_name === `${owner}/${repo}`)
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

  // On mount: fetch latest job
  useEffect(() => {
    if (!owner || !repo || !user) return
    fetch(`/api/ingest/${owner}/${repo}/latest`, { credentials: 'include' })
      .then(async res => {
        if (res.status === 404) return
        if (!res.ok) return
        const data: JobStatus = await res.json()
        setJob(data)
        setJobId(data.job_id)
        if (data.status === 'pending' || data.status === 'running') {
          startPolling(data.job_id)
        }
      })
      .catch(() => {})
  }, [owner, repo, user, startPolling])

  useEffect(() => {
    if (jobId) startPolling(jobId)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
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
        if (detail?.code === 'unsupported_language') { showToast(detail.message); return }
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

  if (authLoading || !repoData) return <FullPageSpinner />

  const isSupported = SUPPORTED_LANGS.has(repoData.language ?? '')

  return (
    <div className="min-h-screen bg-background pt-14">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-8">

        {/* Back link */}
        <Link
          to="/repositories"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          All Repositories
        </Link>

        {/* Repo header card */}
        <RepoHeader repo={repoData} />

        {/* Ingestion section */}
        <div>
          <SectionHeading icon={Database} label="Ingestion" />
          {isSupported ? (
            <IngestPanel onIngest={handleIngest} job={job} ingesting={ingesting} />
          ) : (
            <UnsupportedLanguageBanner language={repoData.language} />
          )}
        </div>

        {/* Chat section — only shown when done */}
        {job?.status === 'done' && repoData.full_name && owner && repo && (
          <div>
            <SectionHeading icon={MessageSquare} label="Chat" />
            <ChatPanel
              repoFullName={repoData.full_name}
              owner={owner}
              repo={repo}
            />
          </div>
        )}
      </div>

      {/* Toast notifications */}
      <ToastContainer message={toast} variant="warning" />
    </div>
  )
}
