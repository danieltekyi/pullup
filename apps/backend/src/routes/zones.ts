import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { getBranchFilter } from '../middleware/branchScope.js'
import {
  deleteZone,
  listZoneRates,
  listZones,
  pairKey,
  upsertZone,
  upsertZoneRate,
} from '../data/zonesRepo.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    res.json({ items: await listZones(branchId) })
  }),
)

const zoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number().int().nonnegative(),
  polygon: z.array(z.object({ lat: z.number(), lng: z.number() })).optional(),
})

router.post(
  '/',
  requireAuth,
  validateBody(zoneSchema),
  asyncHandler(async (req, res) => {
    const branchId = req.user!.branchId ?? 'default'
    const now = new Date().toISOString()
    const zone = await upsertZone({ ...(req.body as z.infer<typeof zoneSchema>), branchId, createdAt: now, updatedAt: now })
    res.status(201).json(zone)
  }),
)

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await deleteZone(req.params.id)
    res.json({ ok: true })
  }),
)

// Rates matrix
router.get(
  '/rates',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    const rows = await listZoneRates(branchId)
    const rates: Record<string, number> = {}
    for (const r of rows) rates[r.key] = r.rate
    res.json({ rates })
  }),
)

router.put(
  '/rates',
  requireAuth,
  validateBody(z.object({ rates: z.record(z.string(), z.number()) })),
  asyncHandler(async (req, res) => {
    const branchId = req.user!.branchId ?? 'default'
    for (const [key, rate] of Object.entries(req.body.rates)) {
      await upsertZoneRate({
        key,
        branchId,
        rate: Number(rate),
        updatedAt: new Date().toISOString(),
      })
    }
    res.json({ ok: true })
  }),
)

export { pairKey }
export default router
