import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth, requireGroup } from '../middleware/auth.js'
import { deleteBranch, findBranch, listBranches, upsertBranch } from '../data/branchesRepo.js'
import { notFound } from '../lib/errors.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => res.json({ items: await listBranches() })),
)

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = await findBranch(req.params.id)
    if (!b) throw notFound('branch not found')
    res.json(b)
  }),
)

const upsertSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string(),
  country: z.string(),
  currency: z.enum(['KES', 'GHS', 'USD', 'NGN', 'ZAR']),
  timezone: z.string(),
  active: z.boolean().default(true),
})

router.post(
  '/',
  requireAuth,
  requireGroup('super-admin'),
  validateBody(upsertSchema),
  asyncHandler(async (req, res) => {
    const b = await upsertBranch({
      ...(req.body as z.infer<typeof upsertSchema>),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    res.status(201).json(b)
  }),
)

router.delete(
  '/:id',
  requireAuth,
  requireGroup('super-admin'),
  asyncHandler(async (req, res) => {
    await deleteBranch(req.params.id)
    res.json({ ok: true })
  }),
)

export default router
