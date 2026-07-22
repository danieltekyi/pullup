import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { requireAuth } from '../middleware/access'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

// POST /api/rider-location — rider sends GPS every 30s
app.post('/', requireAuth(), async c => {
  const body = z.object({
    orderId: z.string().min(1),
    lat: z.number(),
    lng: z.number(),
  }).parse(await c.req.json())

  const user = c.get('user')!
  await c.env.KV.put(
    `rider-loc:${body.orderId}`,
    JSON.stringify({ lat: body.lat, lng: body.lng, riderId: user.riderId ?? user.id, updatedAt: new Date().toISOString() }),
    { expirationTtl: 600 }, // 10 min TTL
  )
  return c.json({ ok: true })
})

// GET /api/rider-location/:orderId — public, used by tracker page
app.get('/:orderId', async c => {
  const data = await c.env.KV.get(`rider-loc:${c.req.param('orderId')}`, 'json') as { lat: number; lng: number; updatedAt: string } | null
  if (!data) return c.json({ available: false })
  return c.json({ available: true, ...data })
})

export default app
