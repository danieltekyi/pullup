export interface PhysicsParams {
  fuel_price: number
  base_efficiency: number
  max_payload: number
  alpha: number
  maintenance_rate_per_km: number
  beta: number
  terrain_factor: number
  salary_per_delivery: number
  overhead_per_delivery: number
  profit_margin: number
}

export const PHYSICS_DEFAULTS: PhysicsParams = {
  fuel_price: 14.0,
  base_efficiency: 35.0,
  max_payload: 50.0,
  alpha: 0.3,
  maintenance_rate_per_km: 0.08,
  beta: 0.2,
  terrain_factor: 1.0,
  salary_per_delivery: 5.0,
  overhead_per_delivery: 2.0,
  profit_margin: 20.0,
}

export interface PhysicsBreakdown {
  fuelCost: number
  wearCost: number
  fixedCost: number
  rawCost: number
  marginAmount: number
  charge: number
  overloaded: boolean
}

/**
 * Compute delivery charge from distance and weight using a physics-based rate model.
 *
 * C(d, w) = d × [ fuel_rate(w) + wear_rate(w) ] + fixed_per_delivery
 * charge  = C / (1 − profit_margin / 100)
 */
export function computePhysicsCost(
  distanceKm: number,
  weightKg: number,
  p: PhysicsParams = PHYSICS_DEFAULTS,
): PhysicsBreakdown {
  const d = Math.max(0, distanceKm)
  const w = Math.max(0, weightKg)

  const efficiency = p.base_efficiency > 0 ? p.base_efficiency : 1
  const maxPayload = p.max_payload > 0 ? p.max_payload : 1
  const marginPct = Math.min(Math.max(p.profit_margin, 0), 99.99)
  const overloaded = w > maxPayload
  const loadFraction = Math.min(w / maxPayload, 1)

  const fuelRatePerKm =
    (p.fuel_price / efficiency) * (1 + p.alpha * loadFraction) * p.terrain_factor
  const wearRatePerKm =
    p.maintenance_rate_per_km * (1 + p.beta * loadFraction) * p.terrain_factor

  const fuelCost = r2(d * fuelRatePerKm)
  const wearCost = r2(d * wearRatePerKm)
  const fixedCost = r2(p.salary_per_delivery + p.overhead_per_delivery)
  const rawCost = r2(fuelCost + wearCost + fixedCost)
  const charge = r2(rawCost / (1 - marginPct / 100))
  const marginAmount = r2(charge - rawCost)

  return { fuelCost, wearCost, fixedCost, rawCost, marginAmount, charge, overloaded }
}

function r2(n: number): number {
  return Math.round(n * 100) / 100
}
