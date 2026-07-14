import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Action, MenuKey, Permissions, ResourceKey } from '@pullup/shared'
import { DEFAULT_PERMISSIONS, can as canFn, canSeeMenu as canSeeMenuFn } from '@pullup/shared'
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
    // Fall back to defaults immediately so UI isn't blocked.
    setPermissions(DEFAULT_PERMISSIONS[user.role])
    api
      .get<Permissions>('/api/permissions')
      .then(res => setPermissions(res.data))
      .catch(() => setPermissions(DEFAULT_PERMISSIONS[user.role]))
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
