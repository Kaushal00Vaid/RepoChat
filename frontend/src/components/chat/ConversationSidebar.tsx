import { useState } from 'react'
import {
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { ConversationSummary } from '@/api/conversations'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface ConversationSidebarProps {
  conversations: ConversationSummary[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  loadingConvId: string | null
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  loadingConvId,
}: ConversationSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const startRename = (conv: ConversationSummary) => {
    setRenamingId(conv.id)
    setRenameValue(conv.title)
  }

  const commitRename = (id: string) => {
    const trimmed = renameValue.trim()
    if (trimmed) onRename(id, trimmed)
    setRenamingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">Chats</span>
      </div>

      {/* New Chat button */}
      <div className="px-2 pb-2 shrink-0">
        <Button
          id="btn-new-chat"
          variant="outline"
          size="sm"
          onClick={onNewChat}
          className="w-full gap-2 justify-start text-xs h-8 border-dashed"
        >
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </Button>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1 px-2">
        {conversations.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center pt-6 px-2">
            No chats yet. Start one!
          </p>
        )}

        <div className="space-y-0.5 pb-2">
          {conversations.map(conv => {
            const isActive = conv.id === activeId
            const isRenaming = renamingId === conv.id
            const isDeleting = deleteConfirmId === conv.id
            const isLoading = loadingConvId === conv.id

            return (
              <div
                key={conv.id}
                className={cn(
                  'group relative rounded-lg transition-all duration-150',
                  isActive
                    ? 'bg-primary/10'
                    : 'hover:bg-muted',
                )}
              >
                {isRenaming ? (
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(conv.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => commitRename(conv.id)}
                      className="flex-1 bg-input border border-ring/50 rounded-md px-2 py-0.5 text-xs text-foreground outline-none focus:border-ring"
                    />
                    <button
                      onClick={() => commitRename(conv.id)}
                      className="w-5 h-5 rounded flex items-center justify-center text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : isDeleting ? (
                  <div className="px-3 py-2 space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">Delete this chat?</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { onDelete(conv.id); setDeleteConfirmId(null) }}
                        className="flex-1 text-[11px] px-2 py-1 rounded-md bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="flex-1 text-[11px] px-2 py-1 rounded-md bg-muted border border-border text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelect(conv.id)}
                    className="w-full text-left px-3 py-2 pr-14"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">Loading…</span>
                      </div>
                    ) : (
                      <>
                        <p className={cn(
                          'text-xs font-medium truncate',
                          isActive ? 'text-primary' : 'text-foreground',
                        )}>
                          {conv.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {conv.message_count > 0
                            ? `${Math.floor(conv.message_count / 2)} turn${Math.floor(conv.message_count / 2) !== 1 ? 's' : ''} · `
                            : ''}
                          {relativeTime(conv.updated_at)}
                        </p>
                      </>
                    )}
                  </button>
                )}

                {/* Action buttons */}
                {!isRenaming && !isDeleting && (
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); startRename(conv) }}
                      title="Rename"
                      className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteConfirmId(conv.id) }}
                      title="Delete"
                      className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
