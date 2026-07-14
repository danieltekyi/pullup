import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  Building2,
  DollarSign,
  Settings,
  LogOut,
  UserCog,
  GitBranch,
  Zap,
  MapPin,
  UsersRound,
  History,
  Menu,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { usePermissions } from '../../context/PermissionsContext'
import { cn } from '../../lib/cn'
import type { MenuKey } from '@pullup/shared'

interface NavItem {
  key: MenuKey
  to: string
  label: string
  icon: typeof Package
  exact?: boolean
}

const NAV: NavItem[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { key: 'orders', to: '/orders', label: 'Orders', icon: Package },
  { key: 'customers', to: '/customers', label: 'Customers', icon: UsersRound },
  { key: 'riders', to: '/riders', label: 'Riders', icon: Users },
  { key: 'fleet', to: '/fleet', label: 'Fleet', icon: Truck },
  { key: 'partners', to: '/partners', label: 'Partners', icon: Building2 },
  { key: 'finance', to: '/finance', label: 'Finance', icon: DollarSign },
  { key: 'zones', to: '/zones', label: 'Zones & Rates', icon: MapPin },
  { key: 'physics', to: '/physics-pricing', label: 'Physics Pricing', icon: Zap },
  { key: 'users', to: '/users', label: 'Users', icon: UserCog },
  { key: 'branches', to: '/branches', label: 'Branches', icon: GitBranch },
  { key: 'audit', to: '/audit', label: 'Audit Log', icon: History },
  { key: 'settings', to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  const { canSeeMenu } = usePermissions()
  const navigate = useNavigate()

  const items = NAV.filter(item => canSeeMenu(item.key))

  const roleColors: Record<string, string> = {
    'super-admin': 'bg-red-600',
    manager: 'bg-blue-600',
    rider: 'bg-emerald-600',
  }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 bg-slate-900 text-slate-100 flex flex-col z-40 transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-brand-600 flex items-center justify-center">
            <Package size={20} className="text-white" />
          </div>
          <span className="text-xl font-bold">PullUp</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {items.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          {user && (
            <div className="mb-3">
              <p className="text-sm font-semibold">{user.name}</p>
              <span
                className={cn(
                  'inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold text-white',
                  roleColors[user.role] || 'bg-slate-600',
                )}
              >
                {user.role}
              </span>
            </div>
          )}
          <button
            onClick={async () => {
              await logout()
              navigate('/login')
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
      <button onClick={onMenuClick} aria-label="menu">
        <Menu size={20} />
      </button>
      <span className="font-semibold">PullUp</span>
    </header>
  )
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Topbar onMenuClick={() => setMobileOpen(true)} />
      <main className="lg:ml-64 p-4 lg:p-8 max-w-[1400px] mx-auto">{children}</main>
    </div>
  )
}
