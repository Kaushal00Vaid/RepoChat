import { Logo } from '@/components/ui/logo'
import { LandingHero } from '@/components/landing/LandingHero'
import { LandingFeatures } from '@/components/landing/LandingFeatures'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-hidden flex flex-col font-sans">
      
      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <main className="relative z-10 flex-1 flex flex-col">
        <LandingHero />
        <LandingFeatures />
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 text-center mt-auto bg-card/30">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Logo className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">RepoChat</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Uses GitHub OAuth — your code remains secure and private.
        </p>
      </footer>
    </div>
  )
}
