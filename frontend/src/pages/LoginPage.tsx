import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// GitHub SVG icon
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

export default function LoginPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  // Already logged in → go to repos
  useEffect(() => {
    if (!loading && user) {
      navigate('/repositories', { replace: true })
    }
  }, [user, loading, navigate])

  const handleGitHubLogin = () => {
    // Redirect to backend which then redirects to GitHub
    window.location.href = '/api/auth/github/login'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-violet-600/12 rounded-full blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30 mb-4">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Welcome to RepoChat</h1>
          <p className="mt-1.5 text-sm text-slate-400">Sign in to start chatting with your code</p>
        </div>

        {/* Login card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
          <button
            id="github-login-btn"
            onClick={handleGitHubLogin}
            className="w-full flex items-center justify-center gap-3 bg-[#24292f] hover:bg-[#2f363d] text-white font-semibold py-3 px-5 rounded-xl transition-all border border-white/10 hover:border-white/20 hover:-translate-y-0.5 active:translate-y-0 shadow-lg cursor-pointer"
          >
            <GitHubIcon />
            Continue with GitHub
          </button>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-xs text-slate-600">or</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <p className="mt-5 text-xs text-slate-500 text-center leading-relaxed">
            By continuing, you agree that RepoChat may access your repository list
            to enable the chat feature. We never modify your code.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          RepoChat uses GitHub OAuth — your credentials are never shared with us.
        </p>
      </div>
    </div>
  )
}
