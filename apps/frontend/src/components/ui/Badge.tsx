import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'teal'

const styles: Record<Variant, string> = {
  gray: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  purple: 'bg-purple-100 text-purple-800',
  teal: 'bg-teal-100 text-teal-800',
}

interface Props {
  variant?: Variant
  children: ReactNode
  className?: string
}

export function Badge({ variant = 'gray', children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, Variant> = {
    pending: 'gray',
    assigned: 'blue',
    picked_up: 'blue',
    in_transit: 'amber',
    delivered: 'green',
    awaiting_confirmation: 'amber',
    confirmed: 'teal',
    rejected: 'red',
    failed: 'red',
    returned: 'purple',
    cancelled: 'gray',
  }
  return <Badge variant={map[status] || 'gray'}>{status.replace(/_/g, ' ')}</Badge>
}
