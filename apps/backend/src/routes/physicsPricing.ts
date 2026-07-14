import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { computePhysicsCost, PHYSICS_DEFAULTS, type PhysicsParams } from '@pullup/shared'
import { listParams, upsertParam } from '../data/paramsRepo.js'
import { forbidden } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

const router = Router()

router.post(
  '/calculate',
  requireAuth,
  validateBody(
    z.object({
      weight: z.number().nonnegative(),
      distance: z.number().nonnegative(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const rawParams = await listParams('physics')
    const paramMap: Record<string, number> = {}
    for (const p of rawParams) {
      const n = parseFloat(p.value)
      if (!isNaN(n)) paramMap[p.key] = n
    }
    const p: PhysicsParams = {
      fuel_price: paramMap.fuel_price ?? PHYSICS_DEFAULTS.fuel_price,
      base_efficiency: paramMap.base_efficiency ?? PHYSICS_DEFAULTS.base_efficiency,
      max_payload: paramMap.max_payload ?? PHYSICS_DEFAULTS.max_payload,
      alpha: paramMap.alpha ?? PHYSICS_DEFAULTS.alpha,
      maintenance_rate_per_km: paramMap.maintenance_rate_per_km ?? PHYSICS_DEFAULTS.maintenance_rate_per_km,
      beta: paramMap.beta ?? PHYSICS_DEFAULTS.beta,
      terrain_factor: paramMap.terrain_factor ?? PHYSICS_DEFAULTS.terrain_factor,
      salary_per_delivery: paramMap.salary_per_delivery ?? PHYSICS_DEFAULTS.salary_per_delivery,
      overhead_per_delivery: paramMap.overhead_per_delivery ?? PHYSICS_DEFAULTS.overhead_per_delivery,
      profit_margin: paramMap.profit_margin ?? PHYSICS_DEFAULTS.profit_margin,
    }
    const breakdown = computePhysicsCost(req.body.distance, req.body.weight, p)
    logger.info(
      { userId: req.user!.sub, branchId: req.user!.branchId, inputs: req.body, output: breakdown },
      'PHYSICS_CALC',
    )
    res.json({
      charge: breakdown.charge,
      breakdown,
      paramsUsed: p,
      ...(breakdown.overloaded
        ? { warning: `Weight ${req.body.weight} kg exceeds max_payload ${p.max_payload} kg` }
        : {}),
    })
  }),
)

router.put(
  '/params',
  requireAuth,
  validateBody(
    z.object({
      params: z.array(
        z.object({
          id: z.string(),
          key: z.string(),
          value: z.string(),
          label: z.string().optional(),
        }),
      ),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!['super-admin', 'manager'].includes(req.user!.role)) throw forbidden()
    let saved = 0
    for (const item of req.body.params) {
      await upsertParam({
        id: item.id,
        category: 'physics',
        key: item.key,
        value: item.value,
        label: item.label ?? item.key,
        updatedAt: new Date().toISOString(),
      })
      saved++
    }
    res.json({ saved })
  }),
)

export default router
