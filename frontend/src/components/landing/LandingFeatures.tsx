import { Search, Brain, GitBranch, Code2, Shield, Zap } from 'lucide-react'
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card"

const FEATURES = [
  { icon: Search, title: 'Semantic Search', desc: 'Finds relevant code chunks using vector embeddings and keyword ranking.' },
  { icon: Brain, title: 'AI-Powered Answers', desc: 'Get precise, context-aware answers grounded in your actual source code.' },
  { icon: GitBranch, title: 'Multi-turn Conversations', desc: 'Maintain context across multiple questions in a persistent chat.' },
  { icon: Code2, title: 'Inline Citations', desc: 'Every answer references the exact file and line numbers it came from.' },
  { icon: Shield, title: 'Private Repos', desc: 'Works with both public and private GitHub repositories securely.' },
  { icon: Zap, title: 'Instant Setup', desc: 'Connect your GitHub account and start chatting in under a minute.' },
]

export function LandingFeatures() {
  return (
    <section className="w-full max-w-7xl mx-auto px-6 py-24 border-t border-border/40">
      <div className="text-center mb-16">
        <h2 className="text-3xl font-bold tracking-tight mb-4">Built for developers</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Stop guessing where things are. Get immediate, accurate insights into how your code works.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <CardContainer key={title} className="inter-var w-full h-full" containerClassName="py-0 w-full h-full">
            <CardBody className="group/card relative w-full h-full p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-start">
              <CardItem
                translateZ="30"
                className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 group-hover/card:bg-primary/20 group-hover/card:scale-110 transition-all duration-300"
              >
                <Icon className="w-5 h-5 text-primary" />
              </CardItem>
              <CardItem
                translateZ="50"
                as="h3"
                className="font-semibold text-lg text-foreground mb-2 w-full text-left"
              >
                {title}
              </CardItem>
              <CardItem
                translateZ="40"
                as="p"
                className="text-sm text-muted-foreground leading-relaxed w-full text-left"
              >
                {desc}
              </CardItem>
            </CardBody>
          </CardContainer>
        ))}
      </div>
    </section>
  )
}
