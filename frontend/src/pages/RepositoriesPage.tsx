import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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

function LanguageDot({ language }: { language: string | null }) {
  const colors: Record<string, string> = {
    TypeScript: 'bg-blue-400',
    JavaScript: 'bg-yellow-400',
    Python: 'bg-blue-300',
    Go: 'bg-cyan-400',
    Rust: 'bg-orange-500',
    Java: 'bg-red-400',
    'C++': 'bg-pink-400',
    C: 'bg-slate-400',
    Ruby: 'bg-red-500',
    PHP: 'bg-indigo-400',
    "Jupyter Notebook": "bg-[#DA5B0B]"
  }
  if (!language) return null
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${colors[language] ?? 'bg-slate-400'}`} />
      <span className="text-xs text-slate-400">{language}</span>
    </span>
  )
}

function RepoCard({ repo, onSelect }: { repo: Repo; onSelect: (r: Repo) => void }) {
  const updatedDate = repo.updated_at
    ? new Date(repo.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <button
      id={`repo-${repo.id}`}
      onClick={() => onSelect(repo)}
      className="group w-full text-left bg-white/4 hover:bg-white/7 border border-white/8 hover:border-violet-500/40 rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/10 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Repo icon */}
          <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
          <span className="font-semibold text-sm text-white truncate group-hover:text-violet-300 transition-colors">
            {repo.name}
          </span>
        </div>
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
          repo.private
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
        }`}>
          {repo.private ? 'Private' : 'Public'}
        </span>
      </div>

      {repo.description && (
        <p className="text-xs text-slate-500 line-clamp-2 mb-3">{repo.description}</p>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <LanguageDot language={repo.language} />
        {repo.stargazers_count > 0 && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
            {repo.stargazers_count.toLocaleString()}
          </span>
        )}
        {updatedDate && (
          <span className="text-xs text-slate-600 ml-auto">Updated {updatedDate}</span>
        )}
      </div>
    </button>
  )
}

export default function RepositoriesPage() {
  const { user, loading: authLoading, logout } = useAuth()
  const navigate = useNavigate()

  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { replace: true })
    }
  }, [user, authLoading, navigate])

  // Fetch repos
  useEffect(() => {
    if (!user) return

    const fetchRepos = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/repos?per_page=100', { credentials: 'include' })
        if (res.status === 401) {
          await logout()
          navigate('/login', { replace: true })
          return
        }
        if (!res.ok) throw new Error('Failed to load repositories')
        setRepos(await res.json())
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchRepos()
  }, [user])

  const handleSelect = (repo: Repo) => {
    navigate(`/repositories/${repo.full_name}`, { state: { repo } })
  }

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] pt-14">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-violet-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Repositories</h1>
          <p className="text-sm text-slate-400">
            Select a repository to start chatting with your codebase.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            id="repo-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories…"
            className="w-full bg-white/5 border border-white/10 text-white placeholder:text-slate-600 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-violet-500/50 focus:bg-white/7 transition-all"
          />
        </div>

        {/* States */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400">Loading your repositories…</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <p className="text-red-400 font-medium">Failed to load repositories</p>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            <p className="text-xs text-slate-600 mb-4">
              {filtered.length} {filtered.length === 1 ? 'repository' : 'repositories'}
              {search && ` matching "${search}"`}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map((repo) => (
                <RepoCard key={repo.id} repo={repo} onSelect={handleSelect} />
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-20">
                <p className="text-slate-400 font-medium">No repositories found</p>
                <p className="text-sm text-slate-600 mt-1">Try a different search term</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
