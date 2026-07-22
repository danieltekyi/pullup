import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { badRequest } from '../lib/errors'
import { createOrder } from '../repos/orders'

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

  const [baseFeeRow, rateRow, minRow, weightThresholdRow, weightSurchargeRow] = await Promise.all([
    c.env.DB.prepare("SELECT value FROM params WHERE key='base_fee' AND category='delivery'").first<{ value: string }>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key='rate_per_km' AND category='delivery'").first<{ value: string }>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key='min_fee' AND category='delivery'").first<{ value: string }>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key='weight_threshold' AND category='delivery'").first<{ value: string }>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key='weight_surcharge' AND category='delivery'").first<{ value: string }>(),
  ])

  const baseFee = Number.parseFloat(baseFeeRow?.value ?? '25')
  const ratePerKm = Number.parseFloat(rateRow?.value ?? '3')
  const minFee = Number.parseFloat(minRow?.value ?? '20')
  const weightThreshold = Number.parseFloat(weightThresholdRow?.value ?? '5')
  const weightSurcharge = Number.parseFloat(weightSurchargeRow?.value ?? '10')

  // --- Road distance via Google Distance Matrix API ---
  let distanceKm: number
  let etaMinutes: number
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

  const weightExtra = weightKg > weightThreshold ? weightSurcharge : 0
  const cost = Math.max(minFee, baseFee + distanceKm! * ratePerKm + weightExtra)

  return c.json({
    distanceKm: distanceKm!,
    cost: Math.round(cost * 100) / 100,
    currency: 'GHS',
    etaMinutes: etaMinutes!,
    etaText,
    usingRoadDistance,
    weightSurcharge: weightExtra,
    breakdown: { baseFee, ratePerKm, distanceKm: distanceKm!, weightKg, weightSurcharge: weightExtra },
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

    return c.json(
      {
        ok: true,
        orderId: order.id,
        trackingUrl: `https://pullupcustomer.aegisassetllc.com/track?orderId=${order.id}`,
      },
      201,
    )
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw badRequest('Invalid order request', err.flatten())
    }
    throw err
  }
})

export default app
