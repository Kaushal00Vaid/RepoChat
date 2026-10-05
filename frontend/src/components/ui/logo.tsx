import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
    >
      {/* Outer Chat Bubble */}
      <path 
        d="M64 48 H192 A48 48 0 0 1 240 96 V160 A48 48 0 0 1 192 208 H112 L64 248 L64 208 A48 48 0 0 1 16 160 V96 A48 48 0 0 1 64 48 Z" 
        stroke="currentColor" 
        strokeWidth="20" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      
      {/* Git Branch - Main Vertical Line */}
      <path 
        d="M88 160 V96" 
        stroke="currentColor" 
        strokeWidth="20" 
        strokeLinecap="round" 
      />
      
      {/* Git Branch - Curved Branch */}
      <path 
        d="M88 128 C 96 104, 120 96, 144 96" 
        stroke="currentColor" 
        strokeWidth="20" 
        strokeLinecap="round" 
      />
      
      {/* Commit Nodes */}
      <circle cx="88" cy="96" r="16" fill="currentColor" />
      <circle cx="88" cy="160" r="16" fill="currentColor" />
      <circle cx="144" cy="96" r="16" fill="currentColor" />
      
      {/* AI Sparkle - Big */}
      <path 
        d="M152 132 C 152 148 160 156 176 156 C 160 156 152 164 152 180 C 152 164 144 156 128 156 C 144 156 152 148 152 132 Z" 
        fill="currentColor" 
      />
      
      {/* AI Sparkle - Small */}
      <path 
        d="M196 104 C 196 116 200 120 212 120 C 200 120 196 124 196 136 C 196 124 192 120 180 120 C 192 120 196 116 196 104 Z" 
        fill="currentColor" 
      />
    </svg>
  )
}
