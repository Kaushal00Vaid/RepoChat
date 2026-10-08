import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Send,
  Code2,
  Menu,
  X,
  MessageCircle,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConversationSidebar } from './ConversationSidebar'
import {
  AssistantMessage,
  UserBubble,
  ErrorBubble,
  ThinkingSkeleton,
} from './ChatMessages'
import type { ChatMessage } from './ChatMessages'
import {
  listConversations,
  getMessages,
  renameConversation,
  deleteConversation,
  type ConversationSummary,
  type HistoryEntry,
} from '@/api/conversations'
import { cn } from '@/lib/utils'

const MAX_HISTORY_PAIRS = 6

interface ChatPanelProps {
  repoFullName: string
  owner: string
  repo: string
}

function EmptyChatState() {
  const suggestions = [
    'How does authentication work?',
    'Where is rate limiting handled?',
    'Explain the folder structure',
    'How are API errors handled?',
  ]
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center gap-6 px-6">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Code2 className="w-7 h-7 text-primary/60" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground mb-1">Ask anything about this codebase</p>
        <p className="text-xs text-muted-foreground">Get instant, AI-powered answers with cited sources</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
        {suggestions.map(s => (
          <div
            key={s}
            className="text-xs text-muted-foreground border border-dashed border-border rounded-lg px-3 py-2 text-left hover:border-primary/40 hover:text-foreground transition-colors cursor-default"
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChatPanel({ repoFullName, owner, repo }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingMessages] = useState(false)
  const [loadingConvId, setLoadingConvId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load conversations on mount
  useEffect(() => {
    let cancelled = false
    listConversations(owner, repo)
      .then(async (convs) => {
        if (cancelled) return
        setConversations(convs)
        if (convs.length > 0) {
          const firstId = convs[0].id
          setActiveConversationId(firstId)
          setLoadingConvId(firstId)
          try {
            const persisted = await getMessages(firstId)
            if (cancelled) return
            setMessages(persisted.map(p => ({
              id: p.id,
              role: p.role as 'user' | 'assistant',
              text: p.content,
              citations: p.citations ?? undefined,
              model: p.model ?? undefined,
            })))
            setHistory(persisted.slice(-(MAX_HISTORY_PAIRS * 2)).map(p => ({
              role: p.role as 'user' | 'assistant',
              content: p.content,
            })))
          } catch { /* silent */ }
          finally { if (!cancelled) setLoadingConvId(null) }
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [owner, repo])

  const selectConversation = useCallback(async (convId: string) => {
    if (convId === activeConversationId) return
    setLoadingConvId(convId)
    setMessages([])
    setHistory([])
    setActiveConversationId(convId)
    setSidebarOpen(false)
    try {
      const persisted = await getMessages(convId)
      setMessages(persisted.map(p => ({
        id: p.id,
        role: p.role,
        text: p.content,
        citations: p.citations ?? undefined,
        model: p.model ?? undefined,
      })))
      setHistory(persisted.slice(-(MAX_HISTORY_PAIRS * 2)).map(p => ({
        role: p.role as 'user' | 'assistant',
        content: p.content,
      })))
    } catch { /* silent */ }
    finally { setLoadingConvId(null) }
  }, [activeConversationId])

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null)
    setMessages([])
    setHistory([])
    setSidebarOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleRename = useCallback(async (convId: string, title: string) => {
    try {
      await renameConversation(convId, title)
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title } : c))
    } catch { /* silent */ }
  }, [])

  const handleDelete = useCallback(async (convId: string) => {
    try {
      await deleteConversation(convId)
      setConversations(prev => prev.filter(c => c.id !== convId))
      if (activeConversationId === convId) {
        setActiveConversationId(null)
        setMessages([])
        setHistory([])
      }
    } catch { /* silent */ }
  }, [activeConversationId])

  const handleSend = useCallback(async () => {
    const q = query.trim()
    if (!q || loading) return

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: q }
    const assistantId = crypto.randomUUID()
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', text: '', isStreaming: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setQuery('')
    setLoading(true)

    const historySnapshot = history.slice(-(MAX_HISTORY_PAIRS * 2))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_full_name: repoFullName,
          query: q,
          conversation_id: activeConversationId,
          history: historySnapshot,
          top_k: 20,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = data?.detail
        const errorText = typeof detail === 'string' ? detail : detail?.message ?? 'Something went wrong.'
        setMessages(prev =>
          prev.map(m => m.id === assistantId
            ? { ...m, isStreaming: false, error: errorText, text: undefined }
            : m)
        )
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalText = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(raw) } catch { continue }

          if (event.type === 'meta') {
            const modelUsed = event.model as string
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, model: modelUsed } : m))
          } else if (event.type === 'delta') {
            const chunk = event.content as string
            finalText += chunk
            const captured = finalText
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: captured } : m))
          } else if (event.type === 'citations') {
            const citations = event.chunks as import('@/api/conversations').Citation[]
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, citations } : m))
          } else if (event.type === 'conversation_id') {
            const newConvId = event.conversation_id as string
            setActiveConversationId(newConvId)
            listConversations(owner, repo).then(setConversations).catch(() => {})
          } else if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, isStreaming: false, error: event.content as string, text: undefined }
                : m
            ))
            return
          } else if (event.type === 'done') {
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m))
            setHistory(prev => [
              ...prev,
              { role: 'user', content: q },
              { role: 'assistant', content: finalText },
            ])
            listConversations(owner, repo).then(setConversations).catch(() => {})
          }
        }
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, isStreaming: false, error: 'Network error. Please try again.', text: undefined }
          : m
      ))
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [query, loading, repoFullName, history, activeConversationId, owner, repo])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const isEmpty = messages.length === 0
  const hasHistory = history.length > 0
  const turnCount = Math.floor(history.length / 2)

  return (
    <div className="flex rounded-2xl border border-border bg-card overflow-hidden shadow-sm" style={{ height: '640px' }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 backdrop-blur-sm sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar*/}
      <div className={cn(
        'flex-shrink-0 w-56 border-r border-border bg-sidebar flex flex-col',
        'sm:relative sm:translate-x-0 sm:flex sm:z-auto',
        'fixed inset-y-0 left-0 z-40 transition-transform duration-200',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0',
      )}>
        {/* Mobile close */}
        <div className="flex items-center justify-end px-3 pt-3 pb-1 sm:hidden">
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={selectConversation}
          onNewChat={handleNewChat}
          onRename={handleRename}
          onDelete={handleDelete}
          loadingConvId={loadingConvId}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Panel header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card/50 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile sidebar toggle */}
            <button
              id="btn-sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              className="sm:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              aria-label="Open chats"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <MessageCircle className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-card-foreground">Chat with Codebase</p>
              <p className="text-[11px] text-muted-foreground">AI-powered · Sources cited inline</p>
            </div>
          </div>

          {hasHistory && (
            <Badge variant="outline" className="text-[10px] gap-1.5 font-normal shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {turnCount} turn{turnCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Message thread */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <div className="px-5 py-5 space-y-5">
            {loadingMessages ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-border border-t-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Loading conversation…</p>
              </div>
            ) : isEmpty && !loading ? (
              <EmptyChatState />
            ) : null}

            {messages.map(msg => (
              <div key={msg.id} className="w-full">
                {msg.role === 'user' ? (
                  <UserBubble text={msg.text ?? ''} />
                ) : msg.error ? (
                  <ErrorBubble error={msg.error} />
                ) : msg.isStreaming && !msg.text ? (
                  <ThinkingSkeleton />
                ) : (
                  <AssistantMessage msg={msg} />
                )}
              </div>
            ))}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input bar */}
        <div className="border-t border-border p-3 shrink-0 bg-card/50">
          <div className="flex items-end gap-2 rounded-xl bg-background border border-border px-3 py-2 focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/20 transition-all duration-200">
            <textarea
              id="chat-query-input"
              ref={inputRef}
              rows={1}
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                // Auto-resize
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about this codebase…"
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50 resize-none leading-relaxed py-0.5 max-h-[120px] scrollbar-thin"
              style={{ minHeight: '24px' }}
            />
            <Button
              id="chat-send-btn"
              onClick={handleSend}
              disabled={loading || !query.trim()}
              size="icon"
              className="w-8 h-8 rounded-lg shrink-0 transition-all duration-150"
            >
              {loading ? (
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Enter to send · Shift+Enter for new line · Citations shown inline
          </p>
        </div>
      </div>
    </div>
  )
}
