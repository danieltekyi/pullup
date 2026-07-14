import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth, requireGroup } from '../middleware/auth.js'
import { deleteParam, listParams, upsertParam } from '../data/paramsRepo.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ items: await listParams(req.query.category as string | undefined) })
  }),
)

router.put(
  '/',
  requireAuth,
  requireGroup('super-admin', 'manager'),
  validateBody(
    z.object({
      params: z.array(
        z.object({
          id: z.string(),
          category: z.string(),
          key: z.string(),
          value: z.string(),
          label: z.string(),
        }),
      ),
    }),
  ),
  asyncHandler(async (req, res) => {
    let saved = 0
    for (const p of req.body.params) {
      await upsertParam({ ...p, updatedAt: new Date().toISOString() })
      saved++
    }
    res.json({ saved })
  }),
)

router.delete(
  '/:id',
  requireAuth,
  requireGroup('super-admin'),
  asyncHandler(async (req, res) => {
    await deleteParam(req.params.id)
    res.json({ ok: true })
  }),
)

export default router
