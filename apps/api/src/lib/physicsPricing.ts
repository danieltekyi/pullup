import { PHYSICS_DEFAULTS, type PhysicsParams } from '@pullup/shared'
import type { Env } from '../env'
import { listParams } from '../repos/misc'

export async function loadPhysicsParams(env: Env): Promise<PhysicsParams> {
  const raw = await listParams(env, 'physics')
  const map: Record<string, number> = {}

  for (const p of raw) {
    const n = Number.parseFloat(p.value)
    if (!Number.isNaN(n)) map[p.key] = n
  }

  return {
    fuel_price: map.fuel_price ?? PHYSICS_DEFAULTS.fuel_price,
    base_efficiency: map.base_efficiency ?? PHYSICS_DEFAULTS.base_efficiency,
    max_payload: map.max_payload ?? PHYSICS_DEFAULTS.max_payload,
    alpha: map.alpha ?? PHYSICS_DEFAULTS.alpha,
    maintenance_rate_per_km: map.maintenance_rate_per_km ?? PHYSICS_DEFAULTS.maintenance_rate_per_km,
    beta: map.beta ?? PHYSICS_DEFAULTS.beta,
    terrain_factor: map.terrain_factor ?? PHYSICS_DEFAULTS.terrain_factor,
    salary_per_delivery: map.salary_per_delivery ?? PHYSICS_DEFAULTS.salary_per_delivery,
    overhead_per_delivery: map.overhead_per_delivery ?? PHYSICS_DEFAULTS.overhead_per_delivery,
    profit_margin: map.profit_margin ?? PHYSICS_DEFAULTS.profit_margin,
  }
}
