import { Star, GitFork, Clock, Globe, Lock, ExternalLink, FolderOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Repo {
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

const LANG_DOT_COLORS: Record<string, string> = {
  TypeScript: 'bg-blue-500',
  JavaScript: 'bg-yellow-400',
  Python: 'bg-sky-400',
  Go: 'bg-cyan-500',
  Rust: 'bg-orange-500',
  Java: 'bg-red-500',
  'C++': 'bg-pink-500',
  C: 'bg-slate-500',
  Ruby: 'bg-red-600',
  PHP: 'bg-indigo-500',
  'Jupyter Notebook': 'bg-orange-600',
  'C#': 'bg-purple-500',
  Swift: 'bg-orange-400',
  Kotlin: 'bg-violet-500',
}

function LanguageDot({ language }: { language: string | null }) {
  if (!language) return null
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          'w-2.5 h-2.5 rounded-full shrink-0',
          LANG_DOT_COLORS[language] ?? 'bg-muted-foreground',
        )}
      />
      <span className="text-xs text-muted-foreground font-medium">{language}</span>
    </span>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface RepoCardProps {
  repo: Repo
  onSelect: (repo: Repo) => void
}

export function RepoCard({ repo, onSelect }: RepoCardProps) {
  const updatedDate = formatDate(repo.updated_at)

  return (
    <button
      id={`repo-${repo.id}`}
      onClick={() => onSelect(repo)}
      className="group w-full text-left bg-card hover:bg-accent/30 border border-border hover:border-primary/40 rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
          <span className="font-semibold text-sm text-card-foreground truncate group-hover:text-primary transition-colors">
            {repo.name}
          </span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 text-[10px] px-2 py-0',
            repo.private
              ? 'border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400'
              : 'border-border text-muted-foreground',
          )}
        >
          {repo.private ? (
            <><Lock className="w-2.5 h-2.5 mr-1" />Private</>
          ) : (
            <><Globe className="w-2.5 h-2.5 mr-1" />Public</>
          )}
        </Badge>
      </div>

      {/* Description */}
      {repo.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
          {repo.description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-3 flex-wrap">
        <LanguageDot language={repo.language} />
        {repo.stargazers_count > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="w-3 h-3" />
            {repo.stargazers_count.toLocaleString()}
          </span>
        )}
        {repo.forks_count > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitFork className="w-3 h-3" />
            {repo.forks_count.toLocaleString()}
          </span>
        )}
        {updatedDate && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
            <Clock className="w-3 h-3" />
            {updatedDate}
          </span>
        )}
      </div>
    </button>
  )
}

// Repo Header Card

interface RepoHeaderProps {
  repo: Repo
}

export function RepoHeader({ repo }: RepoHeaderProps) {
  const updatedDate = formatDate(repo.updated_at)
  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      {/* Name + badge */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <FolderOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-card-foreground truncate">{repo.name}</h1>
            <p className="text-xs text-muted-foreground">{repo.full_name.split('/')[0]}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 text-xs',
            repo.private
              ? 'border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400'
              : 'border-border text-muted-foreground',
          )}
        >
          {repo.private ? (
            <><Lock className="w-3 h-3 mr-1" />Private</>
          ) : (
            <><Globe className="w-3 h-3 mr-1" />Public</>
          )}
        </Badge>
      </div>

      {repo.description && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{repo.description}</p>
      )}

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-4">
        <LanguageDot language={repo.language} />
        {repo.stargazers_count > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Star className="w-3.5 h-3.5" />
            <span className="font-medium text-card-foreground">{repo.stargazers_count.toLocaleString()}</span>
            <span className="text-xs">stars</span>
          </span>
        )}
        {repo.forks_count > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <GitFork className="w-3.5 h-3.5" />
            <span className="font-medium text-card-foreground">{repo.forks_count.toLocaleString()}</span>
            <span className="text-xs">forks</span>
          </span>
        )}
        {updatedDate && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            Updated {updatedDate}
          </span>
        )}
        <a
          href={repo.html_url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
        >
          View on GitHub
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      </div>
    </div>
  )
}
