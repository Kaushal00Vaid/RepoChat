import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Background radial glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] bg-indigo-600/8 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-3xl" />
      </div>

      {/* Hero */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-400"></span>
          </span>
          Now in early access
        </div>

        {/* Headline */}
        <h1 className="max-w-4xl text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-none mb-6">
          <span className="text-white">Chat with your</span>
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            codebase
          </span>
        </h1>

        <p className="max-w-xl text-lg text-slate-400 leading-relaxed mb-10">
          Ask questions about your GitHub repositories and get precise, contextual answers
          — from authentication flows to full feature implementations.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {user ? (
            <Link
              to="/repositories"
              className="group inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5"
            >
              Browse Repositories
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="group inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5"
              >
                Get started
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                to="/login"
                className="text-sm text-slate-400 hover:text-white transition-colors underline underline-offset-4"
              >
                Sign in to existing account
              </Link>
            </>
          )}
        </div>

        {/* Feature pills */}
        <div className="mt-20 flex flex-wrap justify-center gap-3 max-w-2xl">
          {[
            '🔍 Find any implementation',
            '🔐 Auth flow tracing',
            '📁 Public & private repos',
            '⚡ Instant answers',
            '🧠 AI-powered analysis',
          ].map((f) => (
            <span
              key={f}
              className="text-xs text-slate-400 bg-white/5 border border-white/8 px-4 py-2 rounded-full"
            >
              {f}
            </span>
          ))}
        </div>
      </main>
    </div>
  )
}
