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

  const coords = [lat1, lng1, lat2, lng2].map(value => Number.parseFloat(value))
  if (coords.some(value => Number.isNaN(value))) {
    return c.json({ error: 'lat1, lng1, lat2, lng2 must be valid numbers' }, 400)
  }

  const [pickupLat, pickupLng, dropoffLat, dropoffLng] = coords
  const weightKg = weight ? Number.parseFloat(weight) : 0

  const [baseFeeRow, rateRow, minRow, weightThresholdRow, weightSurchargeRow] = await Promise.all([
    c.env.DB.prepare("SELECT value FROM params WHERE key = 'base_fee' AND category = 'delivery'").first<{ value: string }>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key = 'rate_per_km' AND category = 'delivery'").first<{ value: string }>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key = 'min_fee' AND category = 'delivery'").first<{ value: string }>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key = 'weight_threshold' AND category = 'delivery'").first<{ value: string }>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key = 'weight_surcharge' AND category = 'delivery'").first<{ value: string }>(),
  ])

  const baseFee = Number.parseFloat(baseFeeRow?.value ?? '25')
  const ratePerKm = Number.parseFloat(rateRow?.value ?? '3')
  const minFee = Number.parseFloat(minRow?.value ?? '20')
  const weightThreshold = Number.parseFloat(weightThresholdRow?.value ?? '5')
  const weightSurcharge = Number.parseFloat(weightSurchargeRow?.value ?? '10')

  // Haversine distance
  const earthRadiusKm = 6371
  const dLat = ((dropoffLat - pickupLat) * Math.PI) / 180
  const dLng = ((dropoffLng - pickupLng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((pickupLat * Math.PI) / 180) * Math.cos((dropoffLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  const distanceKm = earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const roundedDistanceKm = Math.round(distanceKm * 10) / 10

  // Weight surcharge (only over threshold)
  const weightExtra = weightKg > weightThreshold ? weightSurcharge : 0

  const cost = Math.max(minFee, baseFee + distanceKm * ratePerKm + weightExtra)

  return c.json({
    distanceKm: roundedDistanceKm,
    cost: Math.round(cost * 100) / 100,
    currency: 'GHS',
    weightSurcharge: weightExtra,
    breakdown: {
      baseFee,
      ratePerKm,
      distanceKm: roundedDistanceKm,
      weightKg,
      weightSurcharge: weightExtra,
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
