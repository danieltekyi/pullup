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
    // Decode the JWT locally first — avoids an API round-trip and the 401 loop.
    const payload = decodeJwtPayload(riderToken)
    if (payload && typeof payload.sub === 'string') {
      // Check it hasn't expired
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

  // Cloudflare Access cookie-based auth (admin / manager)
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
