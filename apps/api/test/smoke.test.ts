import { describe, expect, it } from 'vitest'
import { computePhysicsCost, DEFAULT_PERMISSIONS, can } from '@pullup/shared'

describe('shared physics', () => {
  it('computes a plausible charge', () => {
    const b = computePhysicsCost(10, 5)
    expect(b.charge).toBeGreaterThan(0)
    expect(Number.isFinite(b.charge)).toBe(true)
  })
})

describe('permissions', () => {
  it('rider cannot delete orders', () => {
    expect(can(DEFAULT_PERMISSIONS.rider, 'orders', 'delete')).toBe(false)
  })
})
