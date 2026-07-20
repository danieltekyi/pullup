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

// Check if we have a rider session token in localStorage
function getRiderToken(): string | null {
  try { return localStorage.getItem('rider_session') } catch { return null }
}

async function loadUser(): Promise<AuthUser | null> {
  // If there's a rider session token, use it via Authorization header
  const riderToken = getRiderToken()
  if (riderToken) {
    try {
      const res = await api.get<AuthUser>('/api/users/me', {
        headers: { Authorization: `Bearer ${riderToken}` },
      })
      return res.data
    } catch {
      // Token invalid or expired
      localStorage.removeItem('rider_session')
    }
  }
  // Fall back to Cloudflare Access cookie-based auth
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
    // Clear rider session token if present
    try { localStorage.removeItem('rider_session') } catch {}
    logoutApi()
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
