import { Navigate, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePermissions } from '../context/PermissionsContext'
import type { MenuKey } from '@pullup/shared'

interface Props {
  requiredMenu?: MenuKey
  children?: ReactNode
}

export function ProtectedRoute({ requiredMenu, children }: Props) {
  const { user, loading } = useAuth()
  const { canSeeMenu } = usePermissions()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (requiredMenu && !canSeeMenu(requiredMenu)) return <Navigate to="/" replace />
  if (user.role === 'rider') return <Navigate to="/rider" replace />
  return children ? <>{children}</> : <Outlet />
}

export function RiderOnlyRoute({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return children ? <>{children}</> : <Outlet />
}
