import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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
  LayoutGrid,
  Menu,
} from 'lucide-react'
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
  { key: 'settings', to: '/launchpad', label: 'App Links', icon: LayoutGrid },
  { key: 'settings', to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  const { canSeeMenu } = usePermissions()

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
            onClick={() => {
              logout()
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

function BottomNavLink({ to, icon, label, exact }: { to: string; icon: React.ReactNode; label: string; exact?: boolean }) {
  const location = useLocation()
  const active = exact ? location.pathname === to : location.pathname.startsWith(to)
  return (
    <NavLink to={to} end={exact}
      className={cn(
        'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors',
        active ? 'text-brand-600' : 'text-slate-400',
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  )
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
      <span className="font-bold text-lg">PullUp</span>
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300"
      >
        <Menu size={22} />
      </button>
    </header>
  )
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Topbar onMenuClick={() => setMobileOpen(true)} />
      <main className="lg:ml-64 p-4 lg:p-8 max-w-[1400px] mx-auto pb-20 lg:pb-8">{children}</main>

      {/* Mobile bottom nav — thumb-friendly quick access */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 flex items-center justify-around px-2 py-2 safe-area-pb">
        <BottomNavLink to="/" icon={<LayoutDashboard size={22} />} label="Home" exact />
        <BottomNavLink to="/orders" icon={<Package size={22} />} label="Orders" />
        <BottomNavLink to="/riders" icon={<Users size={22} />} label="Riders" />
        <button
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-slate-400"
        >
          <Menu size={22} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>
    </div>
  )
}
