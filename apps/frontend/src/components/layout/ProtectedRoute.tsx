import { Navigate, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../../context/AuthContext'
import { usePermissions } from '../../context/PermissionsContext'
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
  if (!user) {
    // Redirect to Cloudflare Access login for this domain.
    // /cdn-cgi/access/login is handled at the Cloudflare edge and shows
    // the Access login page for pulluprider.* / pullup.*
    if (typeof window !== 'undefined') {
      window.location.replace(`/cdn-cgi/access/login${window.location.pathname}`)
    }
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Redirecting to login…</div>
  }
  if (requiredMenu && !canSeeMenu(requiredMenu)) return <Navigate to="/" replace />
  if (user.role === 'rider') return <Navigate to="/rider" replace />
  return children ? <>{children}</> : <Outlet />
}

export function RiderOnlyRoute({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>
  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.replace('/cdn-cgi/access/login/')
    }
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Redirecting to login…</div>
  }
  return children ? <>{children}</> : <Outlet />
}
