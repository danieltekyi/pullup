import { describe, expect, it } from 'vitest'
import { computePhysicsCost, PHYSICS_DEFAULTS } from '@pullup/shared'

describe('computePhysicsCost', () => {
  it('returns zero fuel/wear at zero distance', () => {
    const b = computePhysicsCost(0, 10)
    expect(b.fuelCost).toBe(0)
    expect(b.wearCost).toBe(0)
    expect(b.fixedCost).toBeGreaterThan(0)
    expect(b.charge).toBeGreaterThan(0) // margin still applied over fixed
  })

  it('clamps negative distance and weight', () => {
    const b = computePhysicsCost(-5, -10)
    expect(b.fuelCost).toBe(0)
    expect(b.wearCost).toBe(0)
    expect(b.overloaded).toBe(false)
  })

  it('increases fuel cost with distance', () => {
    const a = computePhysicsCost(1, 0)
    const b = computePhysicsCost(10, 0)
    expect(b.fuelCost).toBeGreaterThan(a.fuelCost * 5)
  })

  it('adds load multiplier for heavier parcels', () => {
    const light = computePhysicsCost(10, 0)
    const heavy = computePhysicsCost(10, 50)
    expect(heavy.fuelCost).toBeGreaterThan(light.fuelCost)
  })

  it('flags overloaded parcels but still returns a charge', () => {
    const b = computePhysicsCost(10, 200, { ...PHYSICS_DEFAULTS, max_payload: 50 })
    expect(b.overloaded).toBe(true)
    expect(b.charge).toBeGreaterThan(0)
  })

  it('caps profit margin below 100% to avoid infinite charge', () => {
    const b = computePhysicsCost(10, 10, { ...PHYSICS_DEFAULTS, profit_margin: 200 })
    expect(Number.isFinite(b.charge)).toBe(true)
  })

  it('guards against division by zero on base_efficiency', () => {
    const b = computePhysicsCost(10, 10, { ...PHYSICS_DEFAULTS, base_efficiency: 0 })
    expect(Number.isFinite(b.fuelCost)).toBe(true)
  })

  it('rounds to two decimal places', () => {
    const b = computePhysicsCost(3.333, 7.777)
    for (const v of [b.fuelCost, b.wearCost, b.fixedCost, b.rawCost, b.charge, b.marginAmount]) {
      expect(v).toBe(Math.round(v * 100) / 100)
    }
  })
})
