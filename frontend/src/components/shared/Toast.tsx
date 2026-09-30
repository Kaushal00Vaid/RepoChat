import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'default' | 'success' | 'error' | 'warning'

interface ToastProps {
  message: string
  variant?: ToastVariant
  onClose?: () => void
}

const variantConfig: Record<ToastVariant, { icon: React.ReactNode; className: string }> = {
  default: {
    icon: <Info className="w-4 h-4 text-primary shrink-0" />,
    className: 'bg-card border-border text-foreground',
  },
  success: {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />,
    className: 'bg-card border-emerald-200 dark:border-emerald-800 text-foreground',
  },
  error: {
    icon: <AlertCircle className="w-4 h-4 text-destructive shrink-0" />,
    className: 'bg-card border-destructive/20 text-foreground',
  },
  warning: {
    icon: <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />,
    className: 'bg-card border-amber-200 dark:border-amber-800 text-foreground',
  },
}

export function Toast({ message, variant = 'default', onClose }: ToastProps) {
  const config = variantConfig[variant]

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm animate-fade-in-up',
        config.className,
      )}
    >
      {config.icon}
      <p className="text-sm flex-1 leading-relaxed">{message}</p>
      {onClose && (
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// Hook-like toast container placed at bottom-center
interface ToastContainerProps {
  message: string | null
  variant?: ToastVariant
}

export function ToastContainer({ message, variant = 'warning' }: ToastContainerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (message) setVisible(true)
    else setVisible(false)
  }, [message])

  if (!message || !visible) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]">
      <Toast message={message} variant={variant} onClose={() => setVisible(false)} />
    </div>
  )
}
