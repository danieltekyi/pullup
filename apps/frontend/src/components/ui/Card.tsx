import type { ReactNode, HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

// Omit `title` from HTMLAttributes because we type it as ReactNode (not string)
interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  action?: ReactNode
  padded?: boolean
  children?: ReactNode
}

export function Card({ title, action, padded = true, children, className, ...rest }: Props) {
  return (
    <div className={cn('card', padded && 'p-5', className)} {...rest}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
