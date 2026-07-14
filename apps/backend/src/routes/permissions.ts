import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth, requireGroup } from '../middleware/auth.js'
import { getPermissionsForRole, setPermissionsForRole } from '../data/permissionsRepo.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const perms = await getPermissionsForRole(req.user!.role)
    res.json(perms)
  }),
)

router.get(
  '/:role',
  requireAuth,
  requireGroup('super-admin'),
  asyncHandler(async (req, res) => {
    const role = req.params.role as 'super-admin' | 'manager' | 'rider'
    res.json(await getPermissionsForRole(role))
  }),
)

router.put(
  '/:role',
  requireAuth,
  requireGroup('super-admin'),
  validateBody(
    z.object({
      menus: z.record(z.string(), z.boolean()),
      actions: z.record(
        z.string(),
        z.object({ create: z.boolean(), read: z.boolean(), update: z.boolean(), delete: z.boolean() }),
      ),
    }),
  ),
  asyncHandler(async (req, res) => {
    await setPermissionsForRole(req.params.role as never, req.body as never)
    res.json({ ok: true })
  }),
)

export default router
