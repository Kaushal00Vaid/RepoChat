import { Download, Play, RefreshCw, CheckCircle2, Loader2, AlertTriangle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

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

interface IngestPanelProps {
  onIngest: () => void
  job: JobStatus | null
  ingesting: boolean
}

export function UnsupportedLanguageBanner({ language }: { language: string | null }) {
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex gap-3 items-start">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-amber-700 dark:text-amber-400 text-sm mb-0.5">Language Not Supported</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          RepoChat currently supports{' '}
          <span className="font-medium text-foreground">Python</span>,{' '}
          <span className="font-medium text-foreground">JavaScript</span>, and{' '}
          <span className="font-medium text-foreground">TypeScript</span> repositories.
          {language && (
            <> This repo's primary language is{' '}
              <span className="font-medium text-amber-600 dark:text-amber-400">{language}</span>.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export function IngestPanel({ onIngest, job, ingesting }: IngestPanelProps) {
  const pct = job && job.total_chunks > 0
    ? Math.round((job.chunks_ingested / job.total_chunks) * 100)
    : 0

  // No job / failed
  if (!job || job.status === 'failed') {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Download className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-card-foreground text-sm mb-0.5">Ingest Codebase</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Chunks your code with AST parsing, generates embeddings, and stores them in a vector database so you can chat with it.
            </p>
          </div>
        </div>

        {job?.status === 'failed' && job.error_message && (
          <div className="rounded-lg bg-destructive/8 border border-destructive/20 p-3 flex gap-2.5 items-start">
            <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-destructive mb-0.5">Previous ingestion failed</p>
              <p className="text-xs text-muted-foreground break-words">{job.error_message}</p>
            </div>
          </div>
        )}

        <Button
          id="btn-ingest"
          onClick={onIngest}
          disabled={ingesting}
          className="w-full gap-2"
        >
          {ingesting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Dispatching…
            </>
          ) : (
            <>
              {job?.status === 'failed' ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {job?.status === 'failed' ? 'Retry Ingestion' : 'Ingest Codebase'}
            </>
          )}
        </Button>
      </div>
    )
  }

  // Pending
  if (job.status === 'pending') {
    return (
      <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4 shadow-sm">
        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        </div>
        <div>
          <p className="font-semibold text-card-foreground text-sm">Queued</p>
          <p className="text-xs text-muted-foreground mt-0.5">Waiting for the ingestion worker to pick up this job…</p>
        </div>
      </div>
    )
  }

  // Running
  if (job.status === 'running') {
    return (
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="font-semibold text-card-foreground text-sm">Ingesting…</p>
              <span className="text-xs font-mono text-primary">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
            {job.total_chunks > 0 && (
              <p className="text-xs text-muted-foreground">
                {job.chunks_ingested.toLocaleString()} / {job.total_chunks.toLocaleString()} chunks embedded
              </p>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Parsing your code, generating embeddings via OpenRouter, and storing in Qdrant…
        </p>
      </div>
    )
  }

  // Done
  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-5 flex items-center gap-4 shadow-sm">
      <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <p className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm">Ready to Chat</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {job.chunks_ingested.toLocaleString()} chunks indexed. You can now chat with this codebase.
        </p>
      </div>
    </div>
  )
}
