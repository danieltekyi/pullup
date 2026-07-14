import { create } from 'zustand'
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/cn'

type Kind = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  kind: Kind
  message: string
}

interface Store {
  toasts: Toast[]
  push: (kind: Kind, message: string) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<Store>(set => ({
  toasts: [],
  push: (kind, message) => {
    const id = Math.random().toString(36).slice(2)
    set(s => ({ toasts: [...s.toasts, { id, kind, message }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000)
  },
  dismiss: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  info: (m: string) => useToastStore.getState().push('info', m),
  warning: (m: string) => useToastStore.getState().push('warning', m),
}

const styles: Record<Kind, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
}
const icons: Record<Kind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

export function ToastViewport() {
  const toasts = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const Icon = icons[t.kind]
        return (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg min-w-64 max-w-md cursor-pointer',
              styles[t.kind],
            )}
          >
            <Icon size={18} className="mt-0.5 flex-shrink-0" />
            <p className="text-sm font-medium">{t.message}</p>
          </div>
        )
      })}
    </div>
  )
}
