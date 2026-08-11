import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Action, MenuKey, Permissions, ResourceKey } from '@pullup/shared'
import { permissionsForRole, isPermissions, can as canFn, canSeeMenu as canSeeMenuFn } from '@pullup/shared'
import { useAuth } from './AuthContext'
import { api } from '../services/api'

interface Ctx {
  permissions: Permissions | null
  can: (resource: ResourceKey, action: Action) => boolean
  canSeeMenu: (menu: MenuKey) => boolean
}

const PermissionsContext = createContext<Ctx>({} as Ctx)

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState<Permissions | null>(null)

  useEffect(() => {
    if (!user) {
      setPermissions(null)
      return
    }
    // DEF-005: use the safe lookup — an unmapped role used to yield `undefined`
    // and crash the console.
    const fallback = permissionsForRole(user.role)
    setPermissions(fallback)

    let cancelled = false
    api
      .get<Permissions>('/api/permissions')
      .then(res => {
        if (cancelled) return
        // Never trust the response shape. This endpoint can return an error
        // body or an HTML redirect, which previously became `permissions` and
        // threw on `perms.menus`.
        setPermissions(isPermissions(res.data) ? res.data : fallback)
      })
      .catch(() => {
        if (!cancelled) setPermissions(fallback)
      })
    return () => { cancelled = true }
  }, [user])

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        can: (r, a) => canFn(permissions, r, a),
        canSeeMenu: m => canSeeMenuFn(permissions, m),
      }}
    >
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}
