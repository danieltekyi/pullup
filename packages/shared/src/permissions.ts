import type { Action, MenuKey, ResourceKey } from './constants.js'
import type { Role } from './types.js'

export interface ActionPerms {
  create: boolean
  read: boolean
  update: boolean
  delete: boolean
}

export interface Permissions {
  menus: Partial<Record<MenuKey, boolean>>
  actions: Partial<Record<ResourceKey, ActionPerms>>
}

const ALL: ActionPerms = { create: true, read: true, update: true, delete: true }
const READ_ONLY: ActionPerms = { create: false, read: true, update: false, delete: false }
const NONE: ActionPerms = { create: false, read: false, update: false, delete: false }

export const DEFAULT_PERMISSIONS: Record<Role, Permissions> = {
  'super-admin': {
    menus: {
      dashboard: true,
      orders: true,
      riders: true,
      fleet: true,
      partners: true,
      finance: true,
      customers: true,
      users: true,
      branches: true,
      params: true,
      zones: true,
      physics: true,
      settings: true,
      audit: true,
    },
    actions: {
      orders: ALL,
      riders: ALL,
      fleet: ALL,
      partners: ALL,
      finance: ALL,
      customers: ALL,
      users: ALL,
      branches: ALL,
      params: ALL,
      zones: ALL,
    },
  },
  manager: {
    menus: {
      dashboard: true,
      orders: true,
      riders: true,
      fleet: true,
      partners: true,
      finance: true,
      customers: true,
      zones: true,
      physics: true,
      settings: true,
    },
    actions: {
      orders: ALL,
      riders: ALL,
      fleet: ALL,
      partners: { create: true, read: true, update: true, delete: false },
      finance: ALL,
      customers: ALL,
      users: NONE,
      branches: READ_ONLY,
      params: READ_ONLY,
      zones: { create: true, read: true, update: true, delete: false },
    },
  },
  rider: {
    menus: {
      dashboard: false,
      orders: true,
      settings: true,
    },
    actions: {
      orders: { create: false, read: true, update: true, delete: false },
      riders: NONE,
      fleet: NONE,
      partners: NONE,
      finance: NONE,
      customers: READ_ONLY,
      users: NONE,
      branches: NONE,
      params: NONE,
      zones: READ_ONLY,
    },
  },
  // DEF-005/DEF-010: `partner` existed on the Role union but had no entry here.
  // `DEFAULT_PERMISSIONS[role]` returned undefined, which crashed the console
  // in canSeeMenu. Partners see only their own orders — never staff resources.
  partner: {
    menus: {
      dashboard: true,
      orders: true,
      settings: true,
    },
    actions: {
      orders: { create: true, read: true, update: false, delete: false },
      riders: NONE,
      fleet: NONE,
      partners: NONE,
      finance: NONE,
      customers: NONE,
      users: NONE,
      branches: NONE,
      params: NONE,
      zones: READ_ONLY,
    },
  },
}

/**
 * Safe lookup for a role's permissions. Always returns a usable object so a
 * missing or unrecognised role can never crash the UI (DEF-005).
 */
export const EMPTY_PERMISSIONS: Permissions = { menus: {}, actions: {} }

export function permissionsForRole(role: string | undefined | null): Permissions {
  if (!role) return EMPTY_PERMISSIONS
  return DEFAULT_PERMISSIONS[role as Role] ?? EMPTY_PERMISSIONS
}

/** Type guard for data arriving from the API — never trust its shape. */
export function isPermissions(value: unknown): value is Permissions {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<Permissions>
  return typeof v.menus === 'object' && v.menus !== null &&
    typeof v.actions === 'object' && v.actions !== null
}

export function can(perms: Permissions | null, resource: ResourceKey, action: Action): boolean {
  if (!perms || !perms.actions) return false
  return perms.actions[resource]?.[action] ?? false
}

export function canSeeMenu(perms: Permissions | null, menu: MenuKey): boolean {
  if (!perms || !perms.menus) return false
  return perms.menus[menu] ?? false
}
