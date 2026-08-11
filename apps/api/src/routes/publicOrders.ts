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
  /** Accepted for backwards compatibility but ignored — price is server-computed (DEF-007). */
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

    // SECURITY (DEF-007): never trust a client-supplied price. `estimatedCost`
    // arrives from the browser and was written straight to order.cost, so a
    // customer could set their own delivery fee to zero. Recompute server-side
    // from the coordinates and ignore the client value entirely.
    let cost: number | undefined
    if (
      typeof body.pickupLat === 'number' && typeof body.pickupLng === 'number' &&
      typeof body.dropoffLat === 'number' && typeof body.dropoffLng === 'number'
    ) {
      const R = 6371
      const dLat = ((body.dropoffLat - body.pickupLat) * Math.PI) / 180
      const dLng = ((body.dropoffLng - body.pickupLng) * Math.PI) / 180
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((body.pickupLat * Math.PI) / 180) *
        Math.cos((body.dropoffLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
      const distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
      const params = await loadPhysicsParams(c.env)
      cost = computePhysicsCost(distanceKm, body.weight ?? 0, params).charge
    }
    // No coordinates → leave unpriced for staff to quote. Never fall back to
    // the client figure.

    const order = await createOrder(c.env, {
      branchId: 'default',
      status: 'pending',
      customerName: body.senderName,
      customerPhone: body.senderPhone,
      destination: body.recipientAddress,
      description: `${body.description} | Pickup: ${body.senderAddress} | Recipient: ${body.recipientName} (${body.recipientPhone})`,
      cost,
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

// POST /api/public/location-confirm/:token
// Called by the LocatePage after recipient shares their GPS
app.post('/location-confirm/:token', async c => {
  const body = z.object({ lat: z.number(), lng: z.number() }).parse(await c.req.json())
  const token = c.req.param('token')

  const stored = await c.env.KV.get(`loc-req:${token}`, 'json') as {
    orderId: string; senderName: string; description: string
  } | null
  if (!stored) return c.json({ error: 'This link has expired or already been used.' }, 410)

  const { orderId } = stored

  // Reverse geocode to get human-readable address
  let address = `${body.lat.toFixed(6)}, ${body.lng.toFixed(6)}`
  if (c.env.GOOGLE_MAPS_API_KEY) {
    try {
      const geoRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${body.lat},${body.lng}&key=${c.env.GOOGLE_MAPS_API_KEY}`,
        { signal: AbortSignal.timeout(5000) }
      )
      const geo = await geoRes.json<any>()
      if (geo.status === 'OK' && geo.results[0]) address = geo.results[0].formatted_address
    } catch { /* fallback to coords */ }
  }

  // Load the order to get pickup address from description
  const { findOrder, updateOrder } = await import('../repos/orders')
  const order = await findOrder(c.env, orderId)
  if (!order) return c.json({ error: 'Order not found' }, 404)

  // Try to geocode pickup address from description "| Pickup: X |"
  let cost: number | undefined
  const pickupMatch = order.description?.match(/Pickup:\s*([^|]+)/)
  if (pickupMatch?.[1]?.trim() && c.env.GOOGLE_MAPS_API_KEY) {
    try {
      const pRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(pickupMatch[1].trim())}&region=gh&key=${c.env.GOOGLE_MAPS_API_KEY}`,
        { signal: AbortSignal.timeout(5000) }
      )
      const pd = await pRes.json<any>()
      if (pd.status === 'OK' && pd.results[0]) {
        const { lat: pLat, lng: pLng } = pd.results[0].geometry.location
        const R = 6371
        const dLat = (body.lat - pLat) * Math.PI / 180
        const dLng = (body.lng - pLng) * Math.PI / 180
        const a = Math.sin(dLat/2)**2 + Math.cos(pLat*Math.PI/180)*Math.cos(body.lat*Math.PI/180)*Math.sin(dLng/2)**2
        const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
        const params = await loadPhysicsParams(c.env)
        const breakdown = computePhysicsCost(distKm, order.weight ?? 0, params)
        cost = breakdown.charge

        // Store coords for tracker
        await c.env.KV.put(
          `order-coords:${orderId}`,
          JSON.stringify({ pickupLat: pLat, pickupLng: pLng, dropoffLat: body.lat, dropoffLng: body.lng }),
          { expirationTtl: 60 * 60 * 24 * 30 }
        )
      }
    } catch { /* skip cost calc */ }
  }

  // Update order: real address, cost, remove AWAITING_LOCATION marker
  const cleanDescription = (order.description || '').replace(/\s*\[AWAITING_LOCATION\]/, '')
  await updateOrder(c.env, orderId, { destination: address, cost, description: cleanDescription })

  // Burn the token
  await c.env.KV.delete(`loc-req:${token}`)

  return c.json({ ok: true, orderId, address, cost })
})

// POST /api/public/partner-intake
// Public form submitted by potential business partners — no auth required.
const partnerIntakeSchema = z.object({
  bizName:       z.string().trim().min(1),
  contactName:   z.string().trim().min(1),
  phone:         z.string().trim().min(7),
  email:         z.string().trim().optional().or(z.literal('')),
  industry:      z.string().trim().optional(),
  location:      z.string().trim().optional(),
  hasData:       z.boolean().optional(), // false = no delivery history, needs data collection
  weeklyOrders:  z.number().int().nonnegative().optional(),
  deliveryDays:  z.array(z.string()).optional(),
  avgCharge:     z.number().nonnegative().optional(),
  budget:        z.number().nonnegative().optional(),
  dedicated:     z.string().optional(),
  notes:         z.string().trim().optional(),
  source:        z.string().optional(),
  submittedAt:   z.string().optional(),
})

app.post('/partner-intake', async c => {
  const body = partnerIntakeSchema.parse(await c.req.json())
  const now = body.submittedAt || new Date().toISOString()
  const noData = body.hasData === false

  const intakeNotes = [
    `[INTAKE] Contact: ${body.contactName} | Phone: ${body.phone}`,
    noData ? `[NO_DELIVERY_DATA]` : null,
    body.industry    ? `Industry: ${body.industry}` : null,
    body.location    ? `Location: ${body.location}` : null,
    body.weeklyOrders != null ? `Weekly orders: ${body.weeklyOrders}` : null,
    body.deliveryDays?.length ? `Delivery days: ${body.deliveryDays.join(', ')}` : null,
    body.budget != null ? `Budget: GHS ${body.budget}` : null,
    body.dedicated   ? `Dedicated: ${body.dedicated}` : null,
    body.notes       ? `Notes: ${body.notes}` : null,
    `Source: ${body.source || 'partner-intake-form'} | Submitted: ${now}`,
  ].filter(Boolean).join(' | ')

  const { createPartner } = await import('../repos/partners')
  const partner = await createPartner(c.env, {
    name: body.bizName,
    email: body.email || undefined,
    active: false,
    getUrl: '',
    putUrlTemplate: '',
    apiKey: '',
    webhookSecret: intakeNotes,
  })

  // --- Data collection flow: partner has no delivery history ---
  let dataCollectionRequired = false
  let dataCollectionUrl = ''

  if (noData) {
    const token = crypto.randomUUID()
    const collectionRecord = {
      partnerId: partner.id,
      bizName: body.bizName,
      contactName: body.contactName,
      email: body.email || '',
      phone: body.phone,
      location: body.location || '',
      industry: body.industry || '',
      createdAt: now,
      entries: [] as object[],
    }
    // Store for 90 days in KV
    await c.env.KV.put(`partner-data:${token}`, JSON.stringify(collectionRecord), {
      expirationTtl: 60 * 60 * 24 * 90,
    })

    dataCollectionUrl = `https://pullup.aegisassetllc.com/partner-data/${token}`
    dataCollectionRequired = true

    // Email the partner their data collection link
    const contactEmail = body.email
    if (contactEmail) {
      sendEmail(c.env, {
        to: contactEmail,
        subject: `${body.bizName} — Your Free PullUp Delivery Tracker`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff;border-radius:16px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#4f46e5;border-radius:14px">
              <span style="font-size:24px">📦</span>
            </div>
          </div>
          <h2 style="color:#1e293b;text-align:center;margin:0 0 8px">Hi ${body.contactName}! 👋</h2>
          <p style="color:#64748b;text-align:center;margin:0 0 24px">
            Thanks for your interest in partnering with <strong>PullUp</strong>! To give you the most accurate delivery cost proposal, 
            we'd like you to track your deliveries for a few weeks.
          </p>
          <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="margin:0 0 12px;font-weight:600;color:#1e293b">Here's how it works:</p>
            <div style="color:#475569;font-size:14px;line-height:1.8">
              📋 Log your deliveries each week (takes ~2 min)<br/>
              📊 See your estimated monthly cost grow in real time<br/>
              🚀 After 4 weeks, request your custom PullUp proposal<br/>
              ✅ We'll use your real data to give you the best pricing
            </div>
          </div>
          <div style="text-align:center;margin-bottom:24px">
            <a href="${dataCollectionUrl}" 
               style="display:inline-block;padding:14px 32px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700;border-radius:10px;font-size:16px">
              Start Tracking My Deliveries →
            </a>
          </div>
          <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">
            Bookmark this link — you'll use it weekly. It expires in 90 days.<br/>
            Questions? Call us or reply to this email.
          </p>
        </div>`,
      }).catch(() => {})
    }

    // Notify admin too
    sendEmail(c.env, {
      to: 'info@aegisassetllc.com',
      subject: `New partner enquiry (no data yet): ${body.bizName}`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#f59e0b">New Partner Enquiry — Needs Data Collection 📊</h2>
        <p style="color:#64748b;font-size:14px">This prospect doesn't have delivery history yet. A data collection link was sent to them.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#64748b;width:140px">Business</td><td><strong>${body.bizName}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Contact</td><td>${body.contactName}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Phone</td><td>${body.phone}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Email</td><td>${body.email || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Industry</td><td>${body.industry || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Location</td><td>${body.location || '—'}</td></tr>
        </table>
        <p style="margin-top:16px"><a href="${dataCollectionUrl}" style="color:#4f46e5">View their data collection page →</a></p>
      </div>`,
    }).catch(() => {})
  } else {
    // Has existing data — standard onboarding enquiry
    sendEmail(c.env, {
      to: 'info@aegisassetllc.com',
      subject: `New partner enquiry: ${body.bizName}`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#4f46e5">New Partner Enquiry 🤝</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#64748b;width:140px">Business</td><td><strong>${body.bizName}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Contact</td><td>${body.contactName}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Phone</td><td>${body.phone}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Email</td><td>${body.email || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Industry</td><td>${body.industry || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Location</td><td>${body.location || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Weekly orders</td><td>${body.weeklyOrders ?? '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Budget</td><td>GHS ${body.budget ?? '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Notes</td><td>${body.notes || '—'}</td></tr>
        </table>
      </div>`,
    }).catch(() => {})
  }

  return c.json({
    ok: true,
    message: noData
      ? 'We\'ve sent a data collection link to your email. Track your deliveries for 4 weeks and we\'ll prepare your custom proposal!'
      : 'Thank you! Our team will contact you within 24 hours.',
    partnerId: partner.id,
    dataCollectionRequired,
    dataCollectionUrl: dataCollectionRequired ? dataCollectionUrl : undefined,
  }, 201)
})

// ─── Partner Data Collection endpoints ───────────────────────────────────────

interface DataEntry {
  weekLabel: string
  deliveryCount: number
  avgDistanceBand: string // '<5km' | '5-10km' | '10-20km' | '20-30km' | '30km+'
  itemTypes: string[]
  issues: string
  submittedAt: string
}

interface DataCollection {
  partnerId: string
  bizName: string
  contactName: string
  email: string
  phone: string
  location: string
  industry: string
  createdAt: string
  reviewRequested?: boolean
  entries: DataEntry[]
}

// GET /api/public/partner-data/:token
app.get('/partner-data/:token', async c => {
  const raw = await c.env.KV.get(`partner-data:${c.req.param('token')}`)
  if (!raw) return c.json({ error: 'This link has expired or is invalid.' }, 404)
  const data = JSON.parse(raw) as DataCollection
  return c.json({ ok: true, bizName: data.bizName, contactName: data.contactName,
    industry: data.industry, location: data.location, createdAt: data.createdAt,
    entries: data.entries, reviewRequested: data.reviewRequested ?? false })
})

const dataEntrySchema = z.object({
  weekLabel:       z.string().trim().min(1),
  deliveryCount:   z.number().int().min(0),
  avgDistanceBand: z.enum(['<5km', '5-10km', '10-20km', '20-30km', '30km+']),
  itemTypes:       z.array(z.string()).default([]),
  issues:          z.string().trim().default(''),
})

// POST /api/public/partner-data/:token/entry
app.post('/partner-data/:token/entry', async c => {
  const token = c.req.param('token')
  const raw = await c.env.KV.get(`partner-data:${token}`)
  if (!raw) return c.json({ error: 'This link has expired or is invalid.' }, 404)

  const entry: DataEntry = {
    ...dataEntrySchema.parse(await c.req.json()),
    submittedAt: new Date().toISOString(),
  }

  const data = JSON.parse(raw) as DataCollection
  data.entries = [...data.entries, entry]

  await c.env.KV.put(`partner-data:${token}`, JSON.stringify(data), {
    expirationTtl: 60 * 60 * 24 * 90,
  })

  return c.json({ ok: true, totalEntries: data.entries.length })
})

// POST /api/public/partner-data/:token/request-review
app.post('/partner-data/:token/request-review', async c => {
  const token = c.req.param('token')
  const raw = await c.env.KV.get(`partner-data:${token}`)
  if (!raw) return c.json({ error: 'This link has expired or is invalid.' }, 404)

  const data = JSON.parse(raw) as DataCollection
  if (data.reviewRequested) return c.json({ ok: true, alreadyRequested: true })

  data.reviewRequested = true
  await c.env.KV.put(`partner-data:${token}`, JSON.stringify(data), {
    expirationTtl: 60 * 60 * 24 * 90,
  })

  // Build summary table for admin email
  const bandToKm: Record<string, number> = { '<5km': 3, '5-10km': 7.5, '10-20km': 15, '20-30km': 25, '30km+': 35 }
  const totalDeliveries = data.entries.reduce((s, e) => s + e.deliveryCount, 0)
  const avgDeliveries = Math.round(totalDeliveries / Math.max(data.entries.length, 1))
  const avgKm = data.entries.reduce((s, e) => s + (bandToKm[e.avgDistanceBand] ?? 10), 0) / Math.max(data.entries.length, 1)
  const estMonthly = Math.round((avgDeliveries * 4.33) * (15 + avgKm * 2.5))

  const entryRows = data.entries.map((e) =>
    `<tr><td style="padding:6px;border:1px solid #e2e8f0">${e.weekLabel}</td>
     <td style="padding:6px;border:1px solid #e2e8f0;text-align:center">${e.deliveryCount}</td>
     <td style="padding:6px;border:1px solid #e2e8f0;text-align:center">${e.avgDistanceBand}</td>
     <td style="padding:6px;border:1px solid #e2e8f0">${e.itemTypes.join(', ') || '—'}</td>
     <td style="padding:6px;border:1px solid #e2e8f0">${e.issues || '—'}</td></tr>`
  ).join('')

  sendEmail(c.env, {
    to: 'info@aegisassetllc.com',
    subject: `🚀 Partner onboarding review ready: ${data.bizName}`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#059669">Partner Ready for Onboarding Review ✅</h2>
      <p>${data.contactName} from <strong>${data.bizName}</strong> has logged ${data.entries.length} weeks of delivery data and is requesting a custom proposal.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
        <tr><td style="padding:6px 0;color:#64748b;width:140px">Business</td><td><strong>${data.bizName}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Contact</td><td>${data.contactName}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Phone</td><td>${data.phone}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Email</td><td>${data.email || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Location</td><td>${data.location || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Avg weekly deliveries</td><td>${avgDeliveries}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Est. monthly cost</td><td><strong>GHS ${estMonthly.toLocaleString()}</strong></td></tr>
      </table>
      <h3 style="color:#1e293b;margin-top:24px">Weekly Data</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Week</th>
          <th style="padding:8px;border:1px solid #e2e8f0">Deliveries</th>
          <th style="padding:8px;border:1px solid #e2e8f0">Avg Distance</th>
          <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Items</th>
          <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Issues</th>
        </tr></thead>
        <tbody>${entryRows}</tbody>
      </table>
      <p style="margin-top:24px;color:#64748b;font-size:13px">Contact them to present a custom proposal based on this data.</p>
    </div>`,
  }).catch(() => {})

  return c.json({ ok: true })
})

export default app
