import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { getBranchFilter } from '../middleware/branchScope.js'
import {
  createVehicle,
  findVehicle,
  listVehicles,
  softDeleteVehicle,
  updateVehicle,
} from '../data/fleetRepo.js'
import { notFound } from '../lib/errors.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    res.json({ items: await listVehicles(branchId) })
  }),
)

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const v = await findVehicle(req.params.id)
    if (!v) throw notFound('vehicle not found')
    res.json(v)
  }),
)

const upsertSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  registration: z.string().min(1),
  status: z.enum(['available', 'in_use', 'maintenance', 'retired']).default('available'),
  trackerConfig: z.object({ deviceId: z.string().optional(), provider: z.string().optional() }).optional(),
  insuranceExpiry: z.string().optional(),
  licenseExpiry: z.string().optional(),
  odometerKm: z.number().nonnegative().optional(),
})

router.post(
  '/',
  requireAuth,
  validateBody(upsertSchema),
  asyncHandler(async (req, res) => {
    const v = await createVehicle({ ...(req.body as never), branchId: req.user!.branchId ?? 'default' } as never)
    res.status(201).json(v)
  }),
)

router.put(
  '/:id',
  requireAuth,
  validateBody(upsertSchema.partial()),
  asyncHandler(async (req, res) => {
    const v = await updateVehicle(req.params.id, req.body)
    if (!v) throw notFound('vehicle not found')
    res.json(v)
  }),
)

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await softDeleteVehicle(req.params.id)
    res.json({ ok: true })
  }),
)

export default router
