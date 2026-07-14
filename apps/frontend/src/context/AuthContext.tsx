import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Amplify } from 'aws-amplify'
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchUserAttributes,
  fetchAuthSession,
  confirmSignIn,
} from 'aws-amplify/auth'
import type { Role } from '@pullup/shared'
import { api } from '../services/api'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
      userPoolClientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID || '',
    },
  },
})

export interface AuthUser {
  sub: string
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
  login: (email: string, password: string) => Promise<{ requiresNewPassword: true } | void>
  confirmNewPassword: (newPassword: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({} as AuthContextValue)

function toRole(groups: string[]): Role {
  if (groups.includes('super-admin')) return 'super-admin'
  if (groups.includes('manager')) return 'manager'
  return 'rider'
}

async function resolveUser(): Promise<AuthUser | null> {
  try {
    const [cognitoUser, attrs, session] = await Promise.all([
      getCurrentUser(),
      fetchUserAttributes().catch(() => ({}) as Record<string, string | undefined>),
      fetchAuthSession(),
    ])
    const idToken = session.tokens?.idToken
    if (!idToken) return null
    const groups = (idToken.payload['cognito:groups'] as string[] | undefined) ?? []
    const email = attrs.email || cognitoUser.username || ''
    const namePart = email.split('@')[0] || 'User'
    const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1)

    let user: AuthUser = {
      sub: cognitoUser.userId,
      email,
      name: displayName,
      role: toRole(groups),
    }
    try {
      const profile = await api.get('/api/users/me')
      user = {
        ...user,
        name: profile.data.name || displayName,
        branchId: profile.data.branchId,
        managerId: profile.data.managerId,
        riderId: profile.data.riderId,
      }
    } catch {
      // non-fatal — proceed
    }
    return user
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    resolveUser()
      .then(setUser)
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const result = await signIn({ username: email, password })
    if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      return { requiresNewPassword: true as const }
    }
    setUser(await resolveUser())
  }

  async function confirmNewPassword(newPassword: string) {
    await confirmSignIn({ challengeResponse: newPassword })
    setUser(await resolveUser())
  }

  async function logout() {
    await signOut()
    setUser(null)
  }

  async function refresh() {
    setUser(await resolveUser())
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, confirmNewPassword, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
