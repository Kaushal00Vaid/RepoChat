import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { ArrowRight, Shield } from 'lucide-react'
import { MockupWindow, GithubIcon } from './MockupWindow'

export function LandingHero() {
  const { user } = useAuth()

  return (
    <section className="w-full max-w-7xl mx-auto px-6 pt-24 pb-20 lg:pt-32 lg:pb-28 flex flex-col lg:flex-row items-center gap-16">
      {/* Left Text Column */}
      <div className="flex-1 flex flex-col items-start text-left max-w-2xl">
        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
          Chat with your <br />
          <span className="gradient-text">codebase</span>
        </h1>
        
        <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed mb-10 max-w-lg">
          Understand large repositories instantly. Ask questions and get precise, contextual answers directly from your source code.
        </p>
        
        <div className="flex flex-wrap items-center gap-4">
          {user ? (
            <Link
              to="/repositories"
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-8 py-3.5 rounded-xl text-sm transition-all shadow-md hover:shadow-lg group"
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-8 py-3.5 rounded-xl text-sm transition-all shadow-md hover:shadow-lg group"
              >
                Start for free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
        
        <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground font-medium">
          <div className="flex items-center gap-2">
            <GithubIcon className="w-4 h-4" />
            <span>GitHub Integration</span>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-border" />
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>Private & Secure</span>
          </div>
        </div>
      </div>

      {/* Right Demo/Mockup Column */}
      <div className="flex-1 w-full relative">
        <MockupWindow />
      </div>
    </section>
  )
}
