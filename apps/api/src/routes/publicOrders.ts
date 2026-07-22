import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { badRequest } from '../lib/errors'
import { createOrder } from '../repos/orders'
import { sendSms } from '../services/notifications/sms'
import { sendEmail } from '../services/notifications/email'
import { computePhysicsCost } from '@pullup/shared'
import { loadPhysicsParams } from '../lib/physicsPricing'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

const createPublicOrderSchema = z.object({
  senderName: z.string().trim().min(1, 'Sender name is required'),
  senderPhone: z.string().trim().min(1, 'Sender phone is required'),
  senderAddress: z.string().trim().min(1, 'Sender address is required'),
  recipientName: z.string().trim().min(1, 'Recipient name is required'),
  recipientPhone: z.string().trim().min(1, 'Recipient phone is required'),
  recipientAddress: z.string().trim().min(1, 'Recipient address is required'),
  description: z.string().trim().min(1, 'Description is required'),
  weight: z.number().nonnegative().optional(),
  paymentMethod: z.enum(['prepaid', 'cod']).default('cod'),
  specialInstructions: z.string().trim().optional(),
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  dropoffLat: z.number().optional(),
  dropoffLng: z.number().optional(),
  estimatedCost: z.number().nonnegative().optional(),
})

app.get('/orders/estimate', async c => {
  const { lat1, lng1, lat2, lng2, weight } = c.req.query()
  if (!lat1 || !lng1 || !lat2 || !lng2) {
    return c.json({ error: 'lat1, lng1, lat2, lng2 required' }, 400)
  }

  const coords = [lat1, lng1, lat2, lng2].map(v => Number.parseFloat(v))
  if (coords.some(v => Number.isNaN(v))) {
    return c.json({ error: 'coords must be valid numbers' }, 400)
  }

  const [pickupLat, pickupLng, dropoffLat, dropoffLng] = coords
  const weightKg = weight ? Number.parseFloat(weight) : 0
  if (Number.isNaN(weightKg)) {
    return c.json({ error: 'weight must be a valid number' }, 400)
  }

  // --- Road distance via Google Distance Matrix API ---
  let distanceKm = 0
  let etaMinutes = 0
  let usingRoadDistance = false

  if (c.env.GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${pickupLat},${pickupLng}&destinations=${dropoffLat},${dropoffLng}&mode=driving&key=${c.env.GOOGLE_MAPS_API_KEY}`
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      const data = await res.json<{
        status: string
        rows: Array<{ elements: Array<{ status: string; distance: { value: number }; duration: { value: number } }> }>
      }>()
      const el = data.rows?.[0]?.elements?.[0]
      if (data.status === 'OK' && el?.status === 'OK') {
        distanceKm = Math.round((el.distance.value / 1000) * 10) / 10
        // Google returns duration in seconds — add 10 min pickup buffer
        etaMinutes = Math.round(el.duration.value / 60) + 10
        usingRoadDistance = true
      } else {
        throw new Error(`Distance Matrix: ${el?.status ?? data.status}`)
      }
    } catch (err) {
      console.warn('Distance Matrix API failed, falling back to Haversine:', (err as Error).message)
      // Fall through to Haversine
    }
  }

  // --- Haversine fallback ---
  if (!usingRoadDistance) {
    const R = 6371
    const dLat = ((dropoffLat - pickupLat) * Math.PI) / 180
    const dLng = ((dropoffLng - pickupLng) * Math.PI) / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos((pickupLat * Math.PI) / 180) * Math.cos((dropoffLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
    etaMinutes = Math.round((distanceKm / 25) * 60 + 10) // 25 km/h average + 10 min pickup
  }

  const etaText = etaMinutes! < 60
    ? `~${etaMinutes} min`
    : `~${Math.floor(etaMinutes! / 60)}h ${etaMinutes! % 60}min`

  const physicsParams = await loadPhysicsParams(c.env)
  const breakdown = computePhysicsCost(distanceKm, weightKg, physicsParams)

  return c.json({
    distanceKm: distanceKm,
    cost: breakdown.charge,
    currency: 'GHS',
    etaMinutes: etaMinutes,
    etaText,
    usingRoadDistance,
    breakdown: {
      fuelCost: breakdown.fuelCost,
      wearCost: breakdown.wearCost,
      fixedCost: breakdown.fixedCost,
      rawCost: breakdown.rawCost,
      marginAmount: breakdown.marginAmount,
      distanceKm,
      weightKg,
    },
  })
})

app.post('/orders', async c => {
  try {
    const body = createPublicOrderSchema.parse(await c.req.json())
    const order = await createOrder(c.env, {
      branchId: 'default',
      status: 'pending',
      customerName: body.senderName,
      customerPhone: body.senderPhone,
      destination: body.recipientAddress,
      description: `${body.description} | Pickup: ${body.senderAddress} | Recipient: ${body.recipientName} (${body.recipientPhone})`,
      cost: body.estimatedCost,
      paymentMethod: body.paymentMethod,
      weight: body.weight,
      createdBy: 'customer-self-service',
    })

    const trackingUrl = `https://pullupcustomer.aegisassetllc.com/track?orderId=${order.id}`

    // Store pickup/dropoff coords + ETA in KV for the live map tracker
    if (body.pickupLat && body.pickupLng && body.dropoffLat && body.dropoffLng) {
      await c.env.KV.put(
        `order-coords:${order.id}`,
        JSON.stringify({ 
          pickupLat: body.pickupLat, pickupLng: body.pickupLng, 
          dropoffLat: body.dropoffLat, dropoffLng: body.dropoffLng,
        }),
        { expirationTtl: 60 * 60 * 24 * 30 }, // 30 days
      )
    }

    // Send tracking SMS to RECIPIENT (not sender) — they need to know delivery is coming
    const smsMessage = `Hi ${body.recipientName}, a delivery from ${body.senderName} is on its way to you via PullUp! Track it here: ${trackingUrl}`
    const smsSent = await sendSms(c.env, body.recipientPhone, smsMessage)

    // If SMS not configured (no Africa's Talking keys), send email to sender instead
    if (smsSent.skipped) {
      console.info(`SMS not configured — skipping recipient notification for order ${order.id}`)
    }

    // Always send confirmation email to SENDER if we have their info
    // (uses Resend if configured, otherwise logs)
    sendEmail(c.env, {
      to: body.senderPhone.includes('@') ? body.senderPhone : `${body.senderName.toLowerCase().replace(/\s+/g, '')}@noreply.skip`,
      subject: `PullUp order confirmed — ${order.id.slice(-8).toUpperCase()}`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#059669">Order received! ✅</h2>
        <p>Hi <strong>${body.senderName}</strong>, your delivery request has been received.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
          <tr><td style="padding:6px 0;color:#64748b">Order ID</td><td><strong>${order.id}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Recipient</td><td>${body.recipientName} (${body.recipientPhone})</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Delivering to</td><td>${body.recipientAddress}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Payment</td><td>${body.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Prepaid'}</td></tr>
        </table>
        <a href="${trackingUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:white;text-decoration:none;border-radius:8px;font-weight:600">Track delivery</a>
        <p style="font-size:12px;color:#94a3b8;margin-top:24px">Share this tracking link with your recipient: ${trackingUrl}</p>
      </div>`,
    }).catch(() => {}) // non-blocking

    return c.json({ ok: true, orderId: order.id, trackingUrl }, 201)
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw badRequest('Invalid order request', err.flatten())
    }
    throw err
  }
})

export default app
