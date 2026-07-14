import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { getBranchFilter } from '../middleware/branchScope.js'
import {
  createRider,
  findRider,
  listRiders,
  softDeleteRider,
  updateRider,
} from '../data/ridersRepo.js'
import { notFound } from '../lib/errors.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    res.json({ items: await listRiders(branchId) })
  }),
)

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rider = await findRider(req.params.id)
    if (!rider) throw notFound('rider not found')
    res.json(rider)
  }),
)

const upsertSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  zone: z.string(),
  status: z.enum(['active', 'inactive', 'on_delivery']).default('active'),
  vehicleId: z.string().optional(),
  ratePerDelivery: z.number().nonnegative().optional(),
  ratePctOfFee: z.number().min(0).max(100).optional(),
})

router.post(
  '/',
  requireAuth,
  validateBody(upsertSchema),
  asyncHandler(async (req, res) => {
    const user = req.user!
    const rider = await createRider({
      ...(req.body as z.infer<typeof upsertSchema>),
      branchId: user.branchId ?? 'default',
      managerId: user.sub,
    } as never)
    res.status(201).json(rider)
  }),
)

router.put(
  '/:id',
  requireAuth,
  validateBody(upsertSchema.partial()),
  asyncHandler(async (req, res) => {
    const rider = await updateRider(req.params.id, req.body)
    if (!rider) throw notFound('rider not found')
    res.json(rider)
  }),
)

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await softDeleteRider(req.params.id)
    res.json({ ok: true })
  }),
)

export default router
