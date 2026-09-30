import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { RepoCard } from '@/components/repo/RepoCard'
import { FullPageSpinner } from '@/components/shared/LoadingSpinner'
import { Search, RefreshCw, Layers, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination'

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

const PER_PAGE = 12

export default function RepositoriesPage() {
  const { user, loading: authLoading, logout } = useAuth()
  const navigate = useNavigate()

  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { replace: true })
    }
  }, [user, authLoading, navigate])

  const fetchRepos = async () => {
    if (!user) return
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

  useEffect(() => { fetchRepos() }, [user])

  // Reset to page 1 whenever the search changes
  useEffect(() => { setPage(1) }, [search])

  const handleSelect = (repo: Repo) => {
    navigate(`/repositories/${repo.full_name}`, { state: { repo } })
  }

  const filtered = repos.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  // Build page number list with ellipsis logic
  function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const pages: (number | 'ellipsis')[] = [1]
    if (current > 3) pages.push('ellipsis')
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i)
    }
    if (current < total - 2) pages.push('ellipsis')
    pages.push(total)
    return pages
  }

  if (authLoading) return <FullPageSpinner />

  return (
    <div className="min-h-screen bg-background pt-14">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">

        {/* Page header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Repositories</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Select a repository to start chatting with your codebase.
            </p>
          </div>
          {!loading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchRepos}
              className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            id="repo-search"
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search repositories…"
            className="pl-9"
          />
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-7 h-7 rounded-full border-2 border-border border-t-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading your repositories…</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="font-semibold text-foreground">Failed to load repositories</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={fetchRepos} variant="outline" size="sm" className="mt-2 gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Try again
            </Button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Count label */}
            <p className="text-xs text-muted-foreground mb-4">
              {filtered.length} {filtered.length === 1 ? 'repository' : 'repositories'}
              {search && ` matching "${search}"`}
              {totalPages > 1 && ` · page ${safePage} of ${totalPages}`}
            </p>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {paginated.map(repo => (
                <RepoCard key={repo.id} repo={repo} onSelect={handleSelect} />
              ))}
            </div>

            {/* Empty search state */}
            {filtered.length === 0 && (
              <div className="text-center py-20">
                <Layers className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium text-foreground">No repositories found</p>
                <p className="text-sm text-muted-foreground mt-1">Try a different search term</p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className={safePage === 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                    />
                  </PaginationItem>

                  {getPageNumbers(safePage, totalPages).map((p, i) =>
                    p === 'ellipsis' ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === safePage}
                          onClick={() => setPage(p)}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      className={safePage === totalPages ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </div>
    </div>
  )
}
