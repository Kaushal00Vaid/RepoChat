import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Badge } from '@/components/ui/badge'
import { ChunkCard } from './ChunkCard'
import { cn } from '@/lib/utils'
import type { Citation } from '@/api/conversations'

// Types

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text?: string
  citations?: Citation[]
  isStreaming?: boolean
  model?: string
  error?: string
}

// Theme helper
function isDark() {
  return document.documentElement.classList.contains('dark')
}

// Streaming cursor
export function StreamingCursor() {
  return (
    <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle animate-pulse rounded-full" />
  )
}

// Model badge
function ModelBadge({ model }: { model: string }) {
  const isGpt = model === 'gpt-4o-mini'
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[9px] px-1.5 py-0 h-4 gap-1',
        isGpt
          ? 'border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400'
          : 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400',
      )}
    >
      <span className="w-1 h-1 rounded-full bg-current" />
      {isGpt ? 'GPT-4o mini' : 'Gemini 2.5 Flash'}
    </Badge>
  )
}

// Markdown renderer

interface MarkdownContentProps {
  text: string
  isStreaming?: boolean
  citationMap: Map<number, Citation>
  onToggleCitation: (idx: number) => void
}

// Pre-process [N] citation markers into a special inline-code token `CITE:N`
// so we render the ENTIRE message as ONE ReactMarkdown block (no splits).
// We also remove surrounding erratic newlines from the LLM to keep badges inline.
function preprocessCitations(text: string): string {
  // Split by fenced code blocks and inline code to avoid modifying citations inside code (e.g. array[1])
  const codeBlockRegex = /(```[\s\S]*?```|`[^`]*`)/g;
  const parts = text.split(codeBlockRegex);
  
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Match optional leading whitespace, the citation, and optional trailing whitespace + punctuation
      parts[i] = parts[i].replace(/\s*\[(\d+)\](?:\s*([.,;:!?]))?/g, ' `CITE:$1`$2');
    }
  }
  
  return parts.join('');
}

function MarkdownContent({ text, isStreaming, citationMap, onToggleCitation }: MarkdownContentProps) {
  const dark = isDark()
  const processed = preprocessCitations(text)

  return (
    <div className="text-sm text-foreground leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Paragraphs
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,

          // Headings
          h1: ({ children }) => <h1 className="text-base font-bold text-foreground mt-4 mb-2 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-2 mb-1 first:mt-0">{children}</h3>,

          // Lists
          ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2 pl-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2 pl-1">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-foreground leading-relaxed">{children}</li>,

          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">
              {children}
            </blockquote>
          ),

          // Horizontal rule
          hr: () => <hr className="my-3 border-border" />,

          // Strong / em
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
            >
              {children}
            </a>
          ),

          // Code — intercepts both CITE:N tokens (→ citation buttons) and real code blocks
          code: ({ className, children, ...props }) => {
            const content = String(children)

            // Citation badge
            if (content.startsWith('CITE:')) {
              const idx = parseInt(content.slice(5))
              const hasCitation = citationMap.has(idx)
              return (
                <button
                  onClick={() => hasCitation && onToggleCitation(idx)}
                  disabled={!hasCitation}
                  className={cn(
                    'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold mx-0.5 align-middle transition-all duration-150',
                    hasCitation
                      ? 'bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 hover:border-primary/50 cursor-pointer active:scale-95'
                      : 'bg-muted border border-border text-muted-foreground cursor-default',
                  )}
                >
                  {idx}
                </button>
              )
            }

            // Fenced code block
            const match = /language-(\w+)/.exec(className ?? '')
            if (match) {
              const lang = match[1]
              return (
                <div className="my-3 rounded-lg overflow-hidden border border-border">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border">
                    <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">
                      {lang}
                    </span>
                  </div>
                  <SyntaxHighlighter
                    language={lang}
                    style={dark ? oneDark : oneLight}
                    customStyle={{
                      margin: 0,
                      borderRadius: 0,
                      fontSize: '0.75rem',
                      background: dark ? '#282c34' : '#fafafa',
                    }}
                    wrapLongLines
                  >
                    {content.replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              )
            }

            // Inline code
            return (
              <code
                className="font-mono text-[0.8em] bg-muted text-foreground px-1.5 py-0.5 rounded border border-border"
                {...props}
              >
                {children}
              </code>
            )
          },

          // Tables (GFM)
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-border rounded-lg overflow-hidden">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-foreground">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-muted-foreground">{children}</td>,
        }}
      >
        {processed}
      </ReactMarkdown>
      {isStreaming && <StreamingCursor />}
    </div>
  )
}

// AssistantMessage

export function AssistantMessage({ msg }: { msg: ChatMessage }) {
  const [expandedCitations, setExpandedCitations] = useState<Set<number>>(new Set())

  const toggleCitation = (idx: number) => {
    setExpandedCitations(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const citationMap = new Map<number, Citation>(
    (msg.citations ?? []).map(c => [c.index, c])
  )

  return (
    <div className="w-full space-y-3 animate-fade-in">
      <div className="flex items-start gap-2.5">
        {/* AI Avatar */}
        <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {msg.model && (
            <div className="flex items-center gap-2">
              <ModelBadge model={msg.model} />
            </div>
          )}

          {/* Markdown answer with inline citation buttons */}
          <MarkdownContent
            text={msg.text ?? ''}
            isStreaming={msg.isStreaming}
            citationMap={citationMap}
            onToggleCitation={toggleCitation}
          />
        </div>
      </div>

      {/* Expanded citation chunk cards */}
      {expandedCitations.size > 0 && (
        <div className="ml-9 space-y-2">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider px-1">Sources</p>
          {Array.from(expandedCitations)
            .sort((a, b) => a - b)
            .map(idx => {
              const citation = citationMap.get(idx)
              if (!citation) return null
              return <ChunkCard key={idx} chunk={citation} index={idx - 1} />
            })}
        </div>
      )}

      {/* Citations summary bar */}
      {!msg.isStreaming && msg.citations && msg.citations.length > 0 && (
        <div className="ml-9 flex items-center gap-2 px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
          <span className="text-[10px] text-muted-foreground">
            {msg.citations.length} source{msg.citations.length !== 1 ? 's' : ''} cited · click badges to view
          </span>
        </div>
      )}
    </div>
  )
}

// Thinking skeleton

export function ThinkingSkeleton() {
  return (
    <div className="flex items-start gap-2.5 w-full animate-fade-in">
      <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center animate-pulse">
        <Sparkles className="w-3.5 h-3.5 text-primary/40" />
      </div>
      <div className="flex-1 space-y-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="text-xs text-muted-foreground ml-1">Generating answer…</span>
        </div>
      </div>
    </div>
  )
}

// User Bubble

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end animate-fade-in-up">
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground shadow-sm">
        <p className="text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

// Error Bubble

export function ErrorBubble({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl rounded-tl-sm bg-destructive/8 border border-destructive/20 animate-fade-in">
      <Logo className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
      <p className="text-sm text-destructive">{error}</p>
    </div>
  )
}
