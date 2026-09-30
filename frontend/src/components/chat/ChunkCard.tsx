import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'
import type { Citation } from '@/api/conversations'

// Language badge colours

const LANG_BADGE: Record<string, { bg: string; text: string }> = {
  python:     { bg: 'bg-sky-100 dark:bg-sky-900/30',    text: 'text-sky-700 dark:text-sky-400' },
  javascript: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
  typescript: { bg: 'bg-blue-100 dark:bg-blue-900/30',  text: 'text-blue-700 dark:text-blue-400' },
}

// Map common language names to Prism language identifiers
const PRISM_LANG: Record<string, string> = {
  python:     'python',
  javascript: 'javascript',
  typescript: 'typescript',
  js:         'javascript',
  ts:         'typescript',
  py:         'python',
  jsx:        'jsx',
  tsx:        'tsx',
  go:         'go',
  rust:       'rust',
  java:       'java',
  cpp:        'cpp',
  c:          'c',
  csharp:     'csharp',
  ruby:       'ruby',
  php:        'php',
  swift:      'swift',
  kotlin:     'kotlin',
  sql:        'sql',
  bash:       'bash',
  sh:         'bash',
  yaml:       'yaml',
  json:       'json',
  html:       'html',
  css:        'css',
  markdown:   'markdown',
  md:         'markdown',
}

// Detect current theme from document
function isDark() {
  return document.documentElement.classList.contains('dark')
}

interface ChunkResult {
  file_path: string
  language: string
  start_line: number
  end_line: number
  content: string
  chunk_index: number
  rrf_score: number
}

interface ChunkCardProps {
  chunk: ChunkResult | Citation
  index: number
}

export function ChunkCard({ chunk, index }: ChunkCardProps) {
  const [expanded, setExpanded] = useState(index < 2)
  const langKey = chunk.language.toLowerCase()
  const langStyle = LANG_BADGE[langKey] ?? { bg: 'bg-muted', text: 'text-muted-foreground' }
  const prismLang = PRISM_LANG[langKey] ?? 'text'
  const citIndex = 'index' in chunk ? (chunk as Citation).index : index + 1
  const dark = isDark()

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-xs">
      {/* Header */}
      <button
        id={`chunk-card-${citIndex}`}
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-muted/50 transition-colors group"
      >
        {/* Rank badge */}
        <span className="shrink-0 w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
          {citIndex}
        </span>

        {/* File path */}
        <span className="flex-1 min-w-0 font-mono text-xs text-card-foreground truncate">
          {chunk.file_path}
          <span className="text-muted-foreground ml-1">:{chunk.start_line}–{chunk.end_line}</span>
        </span>

        {/* Language badge */}
        <span className={cn('shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full', langStyle.bg, langStyle.text)}>
          {chunk.language}
        </span>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'shrink-0 w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-all duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Syntax-highlighted code */}
      {expanded && (
        <div className="border-t border-border text-xs">
          <SyntaxHighlighter
            language={prismLang}
            style={dark ? oneDark : oneLight}
            showLineNumbers
            startingLineNumber={chunk.start_line}
            customStyle={{
              margin: 0,
              borderRadius: 0,
              fontSize: '0.75rem',
              maxHeight: '280px',
              overflowY: 'auto',
              background: dark ? '#282c34' : '#fafafa',
            }}
            lineNumberStyle={{
              minWidth: '2.5em',
              paddingRight: '1em',
              color: dark ? '#636d83' : '#9ea3b0',
              userSelect: 'none',
            }}
            wrapLongLines
          >
            {chunk.content}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  )
}
