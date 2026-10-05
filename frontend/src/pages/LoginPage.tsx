import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { FullPageSpinner } from '@/components/shared/LoadingSpinner'
import { Logo } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

export default function LoginPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) {
      navigate('/repositories', { replace: true })
    }
  }, [user, loading, navigate])

  const handleGitHubLogin = () => {
    window.location.href = '/api/auth/github/login'
  }

  if (loading) return <FullPageSpinner />

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Subtle gradient blob */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <Logo className="w-12 h-12 mx-auto text-primary mb-4 drop-shadow-md" />
          <h1 className="text-xl font-bold text-foreground">Welcome to RepoChat</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Sign in to start chatting with your code</p>
        </div>

        {/* Login card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-md">
          <Button
            id="github-login-btn"
            onClick={handleGitHubLogin}
            variant="outline"
            className="w-full gap-3 h-11 font-semibold hover:bg-[#24292f] hover:text-white hover:border-[#24292f] transition-all duration-200 group"
          >
            <GitHubIcon className="w-5 h-5" />
            Continue with GitHub
          </Button>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <p className="mt-5 text-xs text-muted-foreground text-center leading-relaxed">
            By continuing, you agree that RepoChat may access your repository list
            to enable the chat feature. We never modify your code.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          RepoChat uses GitHub OAuth — your credentials are never shared with us.
        </p>
      </div>
    </div>
  )
}
