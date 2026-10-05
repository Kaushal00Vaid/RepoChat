import { Command, Sparkles } from 'lucide-react'
import { TypewriterEffect } from '@/components/ui/typewriter-effect'
import { useState, useEffect } from 'react'

export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.2c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  )
}

export function MockupWindow() {
  const promptWords = [
    { text: "Where", className: "text-[#e0ddef]" },
    { text: "is", className: "text-[#e0ddef]" },
    { text: "the", className: "text-[#e0ddef]" },
    { text: "Stripe", className: "text-[#a995c9]" },
    { text: "webhook", className: "text-[#e0ddef]" },
    { text: "handler", className: "text-[#e0ddef]" },
    { text: "and", className: "text-[#e0ddef]" },
    { text: "how", className: "text-[#e0ddef]" },
    { text: "does", className: "text-[#e0ddef]" },
    { text: "it", className: "text-[#e0ddef]" },
    { text: "verify?", className: "text-[#e0ddef]" },
  ]

  const aiWords = [
    { text: "The", className: "text-[#e0ddef]" },
    { text: "webhook", className: "text-[#e0ddef]" },
    { text: "is", className: "text-[#e0ddef]" },
    { text: "handled", className: "text-[#e0ddef]" },
    { text: "in", className: "text-[#e0ddef]" },
    { text: <code className="bg-[#242031] px-1.5 py-0.5 rounded border border-[#302c40]">webhooks.ts</code>, className: "text-[#a995c9]" },
    { text: "using", className: "text-[#e0ddef]" },
    { text: "the", className: "text-[#e0ddef]" },
    { text: "SDK", className: "text-[#e0ddef]" },
    { 
      text: (
        <span className="inline-flex items-center justify-center bg-[#2a2536] text-[#a995c9] rounded px-2 py-0.5 text-[10px] font-mono border border-[#423a54] relative z-10 cursor-pointer">
          1
          <span className="absolute z-50 pointer-events-none text-white drop-shadow-lg demo-seq-cursor block">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>
          </span>
        </span>
      ), 
      className: "text-[#e0ddef]" 
    },
    { text: ".", className: "text-[#e0ddef]" },
    { text: "It", className: "text-[#e0ddef]" },
    { text: "calls", className: "text-[#e0ddef]" },
    { text: <code className="bg-[#242031] px-1.5 py-0.5 rounded border border-[#302c40]">constructEvent</code>, className: "text-[#e0ddef]" },
    { text: "to", className: "text-[#e0ddef]" },
    { text: "verify", className: "text-[#e0ddef]" },
    { text: "signatures.", className: "text-[#e0ddef]" },
  ]

  const [iteration, setIteration] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIteration(i => i + 1);
    }, 18000); // 18 seconds per loop
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Doodle Vector Graphic */}
      <div className="absolute -top-10 -right-10 text-primary/20 animate-pulse-soft hidden md:block">
        <svg width="180" height="180" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <path fill="currentColor" d="M45.7,-76.1C58.9,-69.3,69,-55.4,78.2,-41.5C87.4,-27.6,95.7,-13.8,96.6,0.5C97.5,14.8,91.1,29.6,81.9,43.4C72.7,57.2,60.8,70.1,46.7,78.4C32.6,86.7,16.3,90.4,1.1,88.5C-14.1,86.6,-28.1,79.1,-42.6,71.1C-57.1,63.1,-72.1,54.6,-82.1,41.9C-92.1,29.2,-97.1,12.3,-95.4,-3.8C-93.7,-19.9,-85.3,-35.1,-73.7,-46.8C-62.1,-58.5,-47.4,-66.6,-33.4,-72.6C-19.4,-78.6,-6.1,-82.5,8,-84.9C22.1,-87.3,32.5,-82.9,45.7,-76.1Z" transform="translate(100 100)" />
        </svg>
      </div>

      {/* Main Window Mockup */}
      <div key={iteration} className="relative z-10 w-full max-w-[750px] mx-auto rounded-xl overflow-hidden border border-[#302c40] shadow-2xl bg-[#1a1823] text-[#e0ddef] animate-float">

        {/* Window Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#302c40] bg-[#16141e]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <div className="mx-auto text-xs text-[#a09aad] font-mono flex items-center gap-2 px-3 py-1 rounded-md">
            <GithubIcon className="w-3.5 h-3.5" />
            acme-corp/ecommerce-api
          </div>
        </div>
        
        {/* Window Body */}
        <div className="p-6 h-[460px] flex flex-col gap-6 overflow-hidden">
          {/* User message */}
          <div className="flex gap-4">
            <div className="w-9 h-9 rounded-full bg-[#372e3f] flex items-center justify-center shrink-0 border border-[#45394f]">
              <Command className="w-4 h-4 text-[#a09aad]" />
            </div>
            <div className="bg-[#242031] rounded-2xl px-5 py-3.5 text-[15px] font-medium leading-relaxed border border-[#302c40] flex items-center min-h-[50px]">
              <TypewriterEffect words={promptWords} className="text-[15px] !text-left font-sans !font-medium m-0 leading-none" cursorClassName="h-4 bg-[#a995c9]" />
            </div>
          </div>
          
          {/* Processing Indicator */}
          <div className="flex gap-2 items-center pl-14 demo-seq-thinking">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>

          {/* AI message */}
          <div className="flex gap-4 demo-seq-ai">
            <div className="w-9 h-9 rounded-full bg-transparent flex items-center justify-center shrink-0 border border-[#302c40]">
              <Sparkles className="w-4 h-4 text-[#a09aad]" />
            </div>
            <div className="flex-1 max-w-[95%] w-full flex flex-col gap-2">
              <div className="leading-relaxed text-[15px] font-medium text-[#e0ddef]">
                <TypewriterEffect words={aiWords} delay={6.12} staggerDuration={0.01} className="text-[15px] !text-left font-sans !font-medium m-0 leading-loose" cursorClassName="h-4 bg-transparent" />
              </div>

              {/* Animated Source Box */}
              <div className="demo-seq-source">
                <p className="text-[10px] font-semibold text-[#a09aad] tracking-wider uppercase mt-4 mb-2">Sources</p>
                
                <div className="rounded-xl border border-[#302c40] bg-[#16141e] overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#232030] border-b border-[#302c40]">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#2a2536] text-[#a995c9] border border-[#423a54] px-1.5 py-0.5 rounded text-[10px] font-mono">1</span>
                      <span className="text-xs font-mono font-medium">api/routes/webhooks.ts :24-32</span>
                    </div>
                    <span className="text-[10px] bg-[#1c3e66] text-[#60a5fa] px-2 py-0.5 rounded-full font-medium">typescript</span>
                  </div>
                  <div className="p-4 text-[13px] font-mono text-[#a09aad] overflow-x-auto whitespace-pre leading-loose">
                    <span className="text-[#e06c75]">const</span> sig = req.headers[<span className="text-[#98c379]">'stripe-signature'</span>];{'\n'}
                    <span className="text-[#e06c75]">let</span> event;{'\n'}
                    <span className="text-[#e06c75]">try</span> {'{\n'}
                    {'  '}event = stripe.webhooks.<span className="text-[#61afef]">constructEvent</span>({'\n'}
                    {'    '}req.body, sig, env.STRIPE_SECRET{'\n'}
                    {'  '});{'\n'}
                    {'}'} <span className="text-[#e06c75]">catch</span> (err) {'{\n'}
                    {'  '}<span className="text-[#e06c75]">return</span> res.<span className="text-[#61afef]">status</span>(<span className="text-[#d19a66]">400</span>).<span className="text-[#61afef]">send</span>(err.message);{'\n'}
                    {'}'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
