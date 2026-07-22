import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Role } from '@pullup/shared'
import { api, logout as logoutApi } from '../services/api'

export interface AuthUser {
  sub: string
  id: string
  name: string
  email: string
  role: Role
  branchId?: string
  managerId?: string
  riderId?: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue)

// The rider app only uses localStorage tokens — never Cloudflare Access cookies.
const IS_RIDER_APP = (import.meta.env.VITE_APP_MODE ?? 'admin') === 'rider'

function getRiderToken(): string | null {
  try { return localStorage.getItem('rider_session') } catch { return null }
}

/** Decode a JWT payload without verifying (signature is verified server-side). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.')
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}

async function loadUser(): Promise<AuthUser | null> {
  const riderToken = getRiderToken()
  if (riderToken) {
    const payload = decodeJwtPayload(riderToken)
    if (payload && typeof payload.sub === 'string') {
      if (payload.exp && typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('rider_session')
      } else {
        return {
          sub: payload.sub,
          id: payload.sub,
          email: (payload.email as string) ?? '',
          name: (payload.name as string) ?? 'Rider',
          role: (payload.role as Role) ?? 'rider',
          riderId: payload.riderId as string | undefined,
          branchId: payload.branchId as string | undefined,
        }
      }
    } else {
      localStorage.removeItem('rider_session')
    }
  }

  // Rider app: never fall back to Cloudflare Access cookie auth.
  // If no rider_session, show the login form.
  if (IS_RIDER_APP) return null

  // Admin / Manager: use Cloudflare Access cookie.
  try {
    const res = await api.get<AuthUser>('/api/users/me')
    return res.data
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUser().then(u => { setUser(u); setLoading(false) })
  }, [])

  function logout() {
    try { localStorage.removeItem('rider_session') } catch {}
    // Clear user state immediately → RiderApp shows login form without page reload
    setUser(null)
    // For admin: also sign out of Cloudflare Access
    if (!import.meta.env.VITE_APP_MODE || import.meta.env.VITE_APP_MODE === 'admin') {
      logoutApi()
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      logout,
      refresh: async () => { setUser(await loadUser()) },
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export { getRiderToken }
