import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth, requireGroup } from '../middleware/auth.js'
import {
  createPartner,
  deletePartner,
  findPartner,
  listPartners,
  updatePartner,
} from '../data/partnersRepo.js'
import { fetchFromPartner } from '../services/partnerFetcher.js'
import { notFound } from '../lib/errors.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ items: await listPartners() })
  }),
)

const upsertSchema = z.object({
  name: z.string().min(1),
  getUrl: z.string().url().optional(),
  putUrlTemplate: z.string().optional(),
  apiKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  active: z.boolean().default(true),
  branchId: z.string().optional(),
})

router.post(
  '/',
  requireAuth,
  requireGroup('super-admin', 'manager'),
  validateBody(upsertSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createPartner(req.body as never))
  }),
)

router.put(
  '/:id',
  requireAuth,
  requireGroup('super-admin', 'manager'),
  validateBody(upsertSchema.partial()),
  asyncHandler(async (req, res) => {
    const updated = await updatePartner(req.params.id, req.body)
    if (!updated) throw notFound('partner not found')
    res.json(updated)
  }),
)

router.delete(
  '/:id',
  requireAuth,
  requireGroup('super-admin'),
  asyncHandler(async (req, res) => {
    await deletePartner(req.params.id)
    res.json({ ok: true })
  }),
)

router.post(
  '/:id/fetch',
  requireAuth,
  requireGroup('super-admin', 'manager'),
  asyncHandler(async (req, res) => {
    const partner = await findPartner(req.params.id)
    if (!partner) throw notFound('partner not found')
    const result = await fetchFromPartner(partner)
    res.json(result)
  }),
)

export default router
