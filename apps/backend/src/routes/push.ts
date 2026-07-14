import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { subscribePush, unsubscribePush } from '../data/pushSubsRepo.js'
import { vapidPublicKey } from '../services/notifications/push.js'

const router = Router()

router.get(
  '/vapid',
  asyncHandler(async (_req, res) => {
    const key = vapidPublicKey()
    if (!key) return res.status(503).json({ error: 'vapid not configured' })
    res.json({ publicKey: key })
  }),
)

router.post(
  '/subscribe',
  requireAuth,
  validateBody(
    z.object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
    }),
  ),
  asyncHandler(async (req, res) => {
    await subscribePush({
      userId: req.user!.sub,
      endpoint: req.body.endpoint,
      keys: req.body.keys,
      createdAt: new Date().toISOString(),
    })
    res.json({ ok: true })
  }),
)

router.post(
  '/unsubscribe',
  requireAuth,
  validateBody(z.object({ endpoint: z.string().url() })),
  asyncHandler(async (req, res) => {
    await unsubscribePush(req.user!.sub, req.body.endpoint)
    res.json({ ok: true })
  }),
)

export default router
