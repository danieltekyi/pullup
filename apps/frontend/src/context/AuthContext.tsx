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

async function loadUser(): Promise<AuthUser | null> {
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

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      logout: logoutApi,
      refresh: async () => { setUser(await loadUser()) },
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
