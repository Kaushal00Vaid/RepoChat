import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ArrowRight, Code2, Zap, GitBranch, Shield, Brain, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const FEATURES = [
  { icon: Search, title: 'Semantic Search', desc: 'Finds relevant code chunks using vector embeddings and keyword ranking.' },
  { icon: Brain, title: 'AI-Powered Answers', desc: 'Get precise, context-aware answers grounded in your actual source code.' },
  { icon: GitBranch, title: 'Multi-turn Conversations', desc: 'Maintain context across multiple questions in a persistent chat.' },
  { icon: Code2, title: 'Inline Citations', desc: 'Every answer references the exact file and line numbers it came from.' },
  { icon: Shield, title: 'Private Repos', desc: 'Works with both public and private GitHub repositories securely.' },
  { icon: Zap, title: 'Instant Setup', desc: 'Connect your GitHub account and start chatting in under a minute.' },
]

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-6 pt-28 pb-20 text-center">

        {/* Badge */}
        <Badge
          variant="outline"
          className="mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs border-primary/30 text-primary bg-primary/8"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
          </span>
          Now in early access
        </Badge>

        {/* Headline */}
        <h1 className="max-w-4xl text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] mb-6">
          <span className="text-foreground">Chat with your</span>
          <br />
          <span className="gradient-text">codebase</span>
        </h1>

        <p className="max-w-xl text-lg text-muted-foreground leading-relaxed mb-10">
          Ask questions about your GitHub repositories and get precise, contextual answers
          — from authentication flows to full feature implementations.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {user ? (
            <Link
              to="/repositories"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6 py-2.5 rounded-lg text-sm transition-all shadow-sm hover:shadow-md group"
            >
              Browse Repositories
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6 py-2.5 rounded-lg text-sm transition-all shadow-sm hover:shadow-md group"
              >
                Get started
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
              >
                Sign in to existing account
              </Link>
            </>
          )}
        </div>

        {/* Feature grid */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full text-left">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group glass-card rounded-2xl p-5 hover:border-primary/30 hover:shadow-md transition-all duration-200"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="font-semibold text-sm text-foreground mb-1">{title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center">
        <p className="text-xs text-muted-foreground">
          RepoChat uses GitHub OAuth — your credentials are never shared with us.
        </p>
      </footer>
    </div>
  )
}
