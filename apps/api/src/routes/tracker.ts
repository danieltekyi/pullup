import { Hono } from 'hono'
import { z } from 'zod'
import type { Env, AppVariables } from '../env'
import { requireAuth } from '../middleware/access'
import { badRequest, gone, notFound } from '../lib/errors'
import { buildTrackerUrl, signTrackerToken, verifyTrackerToken } from '../services/trackerLink'
import { findOrder } from '../repos/orders'
import { sendEmail, trackerEmailHtml } from '../services/notifications/email'
import { sendSms } from '../services/notifications/sms'
import { sendWhatsApp } from '../services/notifications/whatsapp'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

// Requires auth (Access-protected) — only staff can mint links.
app.post('/generate', requireAuth(), async c => {
  const body = z.object({
    orderId: z.string().min(1),
    bikeId: z.string().min(1),
    logoUrl: z.string().url().optional(),
    expiresInSeconds: z.number().int().positive().max(7 * 24 * 3600).default(3600),
  }).parse(await c.req.json())

  const order = await findOrder(c.env, body.orderId)
  if (!order) throw notFound()
  const token = await signTrackerToken(c.env, {
    orderId: body.orderId, bikeId: body.bikeId, logoUrl: body.logoUrl,
  }, body.expiresInSeconds)
  return c.json({ trackingUrl: buildTrackerUrl(c.env, token), token, expiresInSeconds: body.expiresInSeconds })
})

app.post('/send', requireAuth(), async c => {
  const body = z.object({
    orderId: z.string().min(1),
    bikeId: z.string().min(1),
    channel: z.enum(['email', 'sms', 'whatsapp']),
    to: z.string().min(1),
    logoUrl: z.string().url().optional(),
  }).parse(await c.req.json())

  const order = await findOrder(c.env, body.orderId)
  if (!order) throw notFound()
  const token = await signTrackerToken(c.env, { orderId: body.orderId, bikeId: body.bikeId, logoUrl: body.logoUrl }, 24 * 3600)
  const url = buildTrackerUrl(c.env, token)

  if (body.channel === 'email') {
    const html = trackerEmailHtml({ trackingUrl: url, orderId: order.id, customerName: order.customerName, logoUrl: body.logoUrl })
    const r = await sendEmail(c.env, { to: body.to, subject: `Track your delivery — ${order.id}`, html })
    if (!r.ok) throw badRequest('email failed')
    return c.json({ ok: true, channel: 'email' })
  }
  if (body.channel === 'sms') {
    const r = await sendSms(c.env, body.to, `Your PullUp delivery is on the way. Track it: ${url}`)
    if (r.skipped) throw badRequest('sms not configured')
    return c.json({ ok: true, channel: 'sms' })
  }
  if (body.channel === 'whatsapp') {
    const r = await sendWhatsApp(c.env, body.to, `Your PullUp delivery is on the way. Track it: ${url}`)
    if (r.skipped) throw badRequest('whatsapp not configured')
    return c.json({ ok: true, channel: 'whatsapp' })
  }
  throw badRequest('unknown channel')
})

// Public — hit by customer /track page. Access must be bypassed for this path.
app.post('/validate', async c => {
  const body = z.object({
    token: z.string().min(10).optional(),
    orderId: z.string().min(1).optional(),
  }).refine(data => data.token || data.orderId, {
    message: 'token or orderId required',
  }).parse(await c.req.json())

  if (body.orderId && !body.token) {
    // Try exact match first, then prefix match (in case the ID was truncated in a URL)
    let order = await findOrder(c.env, body.orderId)
    if (!order) {
      const row = await c.env.DB.prepare(
        `SELECT id FROM orders WHERE id LIKE ? AND deleted_at IS NULL LIMIT 1`
      ).bind(`${body.orderId}%`).first<{ id: string }>()
      if (row) order = await findOrder(c.env, row.id)
    }
    if (!order) throw notFound()
    if (['confirmed', 'delivered', 'rejected'].includes(order.status)) {
      throw gone('tracking link expired — delivery complete')
    }
    const coords = await c.env.KV.get(`order-coords:${order.id}`, 'json') as { pickupLat?: number; pickupLng?: number; dropoffLat?: number; dropoffLng?: number; etaMinutes?: number; etaText?: string } | null
    return c.json({ ok: true, orderId: order.id, orderStatus: order.status, bikeId: order.bikeId, destination: order.destination, customerName: order.customerName, ...coords })
  }

  try {
    const payload = await verifyTrackerToken(c.env, body.token!)
    const order = await findOrder(c.env, payload.orderId)
    if (!order) throw notFound()
    if (['confirmed', 'delivered', 'rejected'].includes(order.status)) {
      throw gone('tracking link expired — delivery complete')
    }
    const coords = await c.env.KV.get(`order-coords:${order.id}`, 'json') as { pickupLat?: number; pickupLng?: number; dropoffLat?: number; dropoffLng?: number; etaMinutes?: number; etaText?: string } | null
    return c.json({ ok: true, orderId: order.id, orderStatus: order.status, bikeId: payload.bikeId, logoUrl: payload.logoUrl, destination: order.destination, customerName: order.customerName, ...coords })
  } catch (err) {
    const name = (err as Error).name
    if (name === 'JWTExpired' || name === 'JWSInvalid' || name === 'JWSSignatureVerificationFailed') {
      throw badRequest('invalid or expired token')
    }
    throw err
  }
})

// Public tracker proxy — returns mock coordinates if unconfigured.
app.get('/proxy', async c => {
  const deviceId = c.req.query('deviceId')
  if (!deviceId) throw badRequest('deviceId required')
  if (!c.env.TRACKER_API_URL) {
    return c.json({ lat: -1.2921, lng: 36.8219, speed: 0, note: 'tracker api not configured' })
  }
  try {
    const url = `${c.env.TRACKER_API_URL}?deviceId=${encodeURIComponent(deviceId)}`
    const headers: Record<string, string> = {}
    if (c.env.TRACKER_API_KEY) headers.Authorization = `Bearer ${c.env.TRACKER_API_KEY}`
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(5_000) })
    if (!r.ok) return c.json({ lat: -1.2921, lng: 36.8219, speed: 0 })
    return c.json(await r.json())
  } catch {
    return c.json({ lat: -1.2921, lng: 36.8219, speed: 0 })
  }
})

export default app
