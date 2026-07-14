import { describe, expect, it } from 'vitest'
import { can, canSeeMenu, DEFAULT_PERMISSIONS } from '@pullup/shared'

describe('permissions', () => {
  it('super-admin can do anything', () => {
    const p = DEFAULT_PERMISSIONS['super-admin']
    expect(can(p, 'orders', 'delete')).toBe(true)
    expect(can(p, 'users', 'delete')).toBe(true)
    expect(canSeeMenu(p, 'audit')).toBe(true)
  })

  it('rider cannot delete orders', () => {
    const p = DEFAULT_PERMISSIONS.rider
    expect(can(p, 'orders', 'delete')).toBe(false)
    expect(can(p, 'orders', 'update')).toBe(true)
    expect(can(p, 'users', 'read')).toBe(false)
  })

  it('manager can update partners but not delete', () => {
    const p = DEFAULT_PERMISSIONS.manager
    expect(can(p, 'partners', 'update')).toBe(true)
    expect(can(p, 'partners', 'delete')).toBe(false)
  })

  it('null perms fail closed', () => {
    expect(can(null, 'orders', 'read')).toBe(false)
    expect(canSeeMenu(null, 'dashboard')).toBe(false)
  })
})
