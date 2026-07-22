import { Hono } from 'hono'
import { z } from 'zod'
import type { Env, AppVariables } from '../env'
import { requireAuth } from '../middleware/access'
import { getBranchFilter, getRiderFilter, getPartnerFilter } from '../middleware/branchScope'
import { badRequest, forbidden, gone, notFound, unprocessable } from '../lib/errors'
import type { AuditActor, Order, OrderStatus } from '@pullup/shared'
import { computePhysicsCost } from '@pullup/shared'
import {
  createOrder,
  findOrder,
  listOrders,
  softDeleteOrder,
  updateOrder,
} from '../repos/orders'
import { listOrderEvents, logOrderEvent } from '../repos/orderEvents'
import { findOrCreateCustomer } from '../repos/customers'
import { notifyPartner } from '../services/partnerFetch'
import { sendPushToUser } from '../services/notifications/push'
import { sendSms } from '../services/notifications/sms'
import { sendWhatsApp } from '../services/notifications/whatsapp'
import { saveProof } from '../services/storage/r2'
import { listParams } from '../repos/misc'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

const listQ = z.object({
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  partnerId: z.string().optional(),
  customerId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  cursor: z.string().optional(),
  branchId: z.string().optional(),
})

function actorFromCtx(c: { get(k: 'user'): AuditActor & { role: 'super-admin' | 'manager' | 'rider' } }): AuditActor {
  const u = c.get('user')
  return { sub: u.sub, email: u.email, role: u.role }
}

app.get('/', requireAuth(), async c => {
  const q = listQ.parse(c.req.query())
  const branchId = getBranchFilter(c)
  const riderId = getRiderFilter(c)
  const partnerIdFilter = getPartnerFilter(c)
  const statuses = q.status ? (q.status.split(',') as OrderStatus[]) : undefined
  const result = await listOrders(c.env, {
    branchId: branchId === '__ALL__' ? undefined : branchId,
    riderId,
    status: statuses,
    from: q.from,
    to: q.to,
    q: q.q,
    // Partner filter takes precedence over query param
    partnerId: partnerIdFilter ?? q.partnerId,
    customerId: q.customerId,
    limit: q.limit,
    cursor: q.cursor,
  })
  return c.json(result)
})

app.get('/:id', requireAuth(), async c => {
  const order = await findOrder(c.env, c.req.param('id'))
  if (!order) throw notFound('order not found')
  const user = c.get('user')!
  if (user.role !== 'super-admin' && order.branchId !== user.branchId) throw forbidden()
  return c.json(order)
})

app.get('/:id/events', requireAuth(), async c => {
  const order = await findOrder(c.env, c.req.param('id'))
  if (!order) throw notFound('order not found')
  const events = await listOrderEvents(c.env, order.id)
  return c.json({ items: events })
})

const createSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  destination: z.string().min(1),
  destinationZone: z.string().optional(),
  originZone: z.string().optional(),
  priority: z.enum(['low', 'normal', 'urgent']).default('normal'),
  weight: z.number().nonnegative().optional(),
  parcelCount: z.number().int().positive().optional(),
  description: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  pricingMode: z.enum(['zone', 'physics', 'manual']).optional(),
  paymentMethod: z.enum(['prepaid', 'cod', 'invoice']).default('prepaid'),
  slaBy: z.string().datetime().optional(),
})

app.post('/', requireAuth(), async c => {
  const body = createSchema.parse(await c.req.json())
  const user = c.get('user')!
  const branchId = user.branchId ?? 'default'

  let customerId: string | undefined
  if (body.customerPhone) {
    const cust = await findOrCreateCustomer(c.env, {
      branchId,
      phone: body.customerPhone,
      name: body.customerName,
      address: body.destination,
    })
    customerId = cust.id
  }

  const order = await createOrder(c.env, {
    branchId,
    status: 'pending',
    priority: body.priority,
    customerId,
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    destination: body.destination,
    destinationZone: body.destinationZone,
    originZone: body.originZone,
    weight: body.weight,
    parcelCount: body.parcelCount,
    description: body.description,
    cost: body.cost,
    pricingMode: body.pricingMode,
    paymentMethod: body.paymentMethod,
    slaBy: body.slaBy,
    createdBy: user.sub,
  })
  await logOrderEvent(c.env, { orderId: order.id, type: 'created', actor: actorFromCtx(c), after: order })
  return c.json(order, 201)
})

const assignSchema = z.object({
  riderId: z.string().min(1),
  cost: z.number().nonnegative().optional(),
  bikeId: z.string().optional(),
})

// Update delivery cost (manual override by admin)
app.put('/:id/cost', requireAuth(), async c => {
  const body = z.object({ cost: z.number().nonnegative() }).parse(await c.req.json())
  const order = await findOrder(c.env, c.req.param('id'))
  if (!order) throw notFound()
  const updated = await updateOrder(c.env, order.id, { cost: body.cost })
  await logOrderEvent(c.env, { orderId: order.id, type: 'priced', actor: actorFromCtx(c), before: order, after: updated, note: `Cost set to ${body.cost}` })
  return c.json(updated)
})

app.post('/:id/assign', requireAuth(), async c => {
  const order = await findOrder(c.env, c.req.param('id'))
  if (!order) throw notFound()
  const body = assignSchema.parse(await c.req.json())
  const effectiveCost = body.cost ?? order.cost
  if (order.partnerId && !effectiveCost) throw unprocessable('Set delivery fee before assigning a partner order')
  const before = { ...order }
  const updated = await updateOrder(c.env, order.id, {
    assignedTo: body.riderId,
    assignedAt: new Date().toISOString(),
    status: 'assigned',
    cost: effectiveCost,
    bikeId: body.bikeId ?? order.bikeId,
  })
  await logOrderEvent(c.env, {
    orderId: order.id,
    type: order.assignedTo ? 'reassigned' : 'assigned',
    actor: actorFromCtx(c),
    before,
    after: updated,
  })
  c.executionCtx.waitUntil(
    sendPushToUser(c.env, body.riderId, {
      title: 'New delivery assigned',
      body: `${updated.customerName} — ${updated.destination}`,
      url: '/',
    }).then(() => undefined).catch(() => undefined),
  )
  return c.json(updated)
})

const bulkSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(200),
  riderId: z.string().min(1),
  cost: z.number().nonnegative().optional(),
})

app.post('/bulk-assign', requireAuth(), async c => {
  const body = bulkSchema.parse(await c.req.json())
  const orders = await Promise.all(body.orderIds.map(id => findOrder(c.env, id)))
  const missing = body.orderIds.filter((_, i) => !orders[i])
  if (missing.length) throw notFound(`missing: ${missing.join(',')}`)
  const blocked = orders.filter(o => o!.partnerId && !o!.cost && !body.cost)
  if (blocked.length) {
    throw unprocessable(`${blocked.length} order(s) need pricing`, { blockedIds: blocked.map(o => o!.id) })
  }
  const results: Order[] = []
  for (const o of orders) {
    const before = { ...o! }
    const updated = await updateOrder(c.env, o!.id, {
      assignedTo: body.riderId,
      assignedAt: new Date().toISOString(),
      status: 'assigned',
      cost: body.cost ?? o!.cost,
    })
    await logOrderEvent(c.env, {
      orderId: o!.id,
      type: o!.assignedTo ? 'reassigned' : 'assigned',
      actor: actorFromCtx(c),
      before,
      after: updated,
    })
    results.push(updated)
  }
  c.executionCtx.waitUntil(
    sendPushToUser(c.env, body.riderId, {
      title: `${results.length} new deliveries`,
      body: 'Open the rider app to see them.',
    }).then(() => undefined).catch(() => undefined),
  )
  return c.json({ assigned: results.length, orders: results })
})

const statusSchema = z.object({
  status: z.enum([
    'picked_up', 'in_transit', 'delivered', 'awaiting_confirmation',
    'failed', 'returned', 'cancelled',
  ]),
  proof: z.object({
    receiverName: z.string().optional(),
    signatureS3Key: z.string().optional(),
    photoS3Key: z.string().optional(),
    gps: z.object({
      lat: z.number(), lng: z.number(), accuracy: z.number().optional(), capturedAt: z.string(),
    }).optional(),
  }).optional(),
  failureReason: z.enum(['recipient_not_home', 'wrong_address', 'refused', 'damaged', 'unreachable', 'other']).optional(),
  failureNote: z.string().optional(),
  codCollected: z.number().nonnegative().optional(),
})

app.put('/:id/status', requireAuth(), async c => {
  const order = await findOrder(c.env, c.req.param('id'))
  if (!order) throw notFound()
  const user = c.get('user')!
  if (user.role === 'rider' && order.assignedTo !== user.riderId) throw forbidden('not your order')
  const body = statusSchema.parse(await c.req.json())
  const before = { ...order }
  const patch: Partial<Order> = { status: body.status }
  const now = new Date().toISOString()
  if (body.status === 'picked_up') patch.pickedUpAt = now
  if (body.status === 'delivered' || body.status === 'awaiting_confirmation') {
    patch.deliveredAt = now
    if (body.proof) patch.proof = { ...body.proof, timestamp: now }
  }
  if (body.status === 'failed') {
    patch.failedAt = now
    patch.failureReason = body.failureReason
    patch.failureNote = body.failureNote
  }
  if (body.codCollected !== undefined) patch.codCollected = body.codCollected
  const updated = await updateOrder(c.env, order.id, patch)
  await logOrderEvent(c.env, { orderId: order.id, type: body.status as never, actor: actorFromCtx(c), before, after: updated })

  if (updated.status === 'awaiting_confirmation' && updated.customerPhone) {
    c.executionCtx.waitUntil(
      sendSms(c.env, updated.customerPhone, `Your PullUp delivery ${updated.id} has arrived.`).then(() => undefined).catch(() => undefined),
    )
  }
  return c.json(updated)
})

app.put('/:id/confirm', requireAuth(), async c => {
  const order = await findOrder(c.env, c.req.param('id'))
  if (!order) throw notFound()
  if (c.get('user')!.role === 'rider') throw forbidden('managers only')
  const before = { ...order }
  const updated = await updateOrder(c.env, order.id, {
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
    revenueStatus: order.revenueStatus === 'suspense' ? 'receivable' : order.revenueStatus,
  })
  await logOrderEvent(c.env, { orderId: order.id, type: 'confirmed', actor: actorFromCtx(c), before, after: updated })
  if (order.partnerId) c.executionCtx.waitUntil(notifyPartner(c.env, order, 'confirmed'))
  return c.json(updated)
})

app.put('/:id/reject', requireAuth(), async c => {
  const order = await findOrder(c.env, c.req.param('id'))
  if (!order) throw notFound()
  if (c.get('user')!.role === 'rider') throw forbidden('managers only')
  const before = { ...order }
  const updated = await updateOrder(c.env, order.id, {
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
  })
  await logOrderEvent(c.env, { orderId: order.id, type: 'rejected', actor: actorFromCtx(c), before, after: updated })
  if (order.partnerId) c.executionCtx.waitUntil(notifyPartner(c.env, order, 'rejected'))
  return c.json(updated)
})

app.delete('/:id', requireAuth(), async c => {
  const order = await findOrder(c.env, c.req.param('id'))
  if (!order) throw notFound()
  if (c.get('user')!.role === 'rider') throw forbidden()
  await softDeleteOrder(c.env, order.id)
  await logOrderEvent(c.env, { orderId: order.id, type: 'cancelled', actor: actorFromCtx(c), before: order })
  return c.json({ ok: true })
})

// Direct upload for proof-of-delivery files.
app.post('/:id/proof/:kind', requireAuth(), async c => {
  const order = await findOrder(c.env, c.req.param('id'))
  if (!order) throw notFound()
  const kind = c.req.param('kind') as 'signature' | 'photo'
  if (kind !== 'signature' && kind !== 'photo') throw badRequest('kind must be signature or photo')
  const form = await c.req.formData()
  const file = form.get('file') as File | null
  if (!file || typeof file === 'string') throw badRequest('file required')
  try {
    const result = await saveProof(c.env, kind, order.id, file)
    return c.json(result)
  } catch (err) {
    throw badRequest((err as Error).message)
  }
})

// CSV/Excel import — parses the PullUp bulk order template
// Accepts CSV text. Columns match the template headers (case-insensitive).
app.post('/upload', requireAuth(), async c => {
  const form = await c.req.formData()
  const file = form.get('file') as File | null
  if (!file || typeof file === 'string') throw badRequest('file required')

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw badRequest('File must have a header row and at least one data row')

  // Parse CSV respecting quoted fields
  function parseCsvLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseCsvLine(lines[0]).map(h => h.replace(/\s*\*/g, '').toLowerCase().replace(/\s+/g, '_'))

  function col(row: string[], name: string): string {
    const idx = headers.findIndex(h => h.includes(name))
    return idx >= 0 ? (row[idx] ?? '').trim() : ''
  }

  const user = c.get('user')!
  const branchId = user.branchId ?? 'default'
  const results: string[] = []
  const errors: string[] = []
  let locationRequested = 0

  // Load pricing params once for all rows
  const [baseFeeRow, rateRow, minRow, weightThreshRow, weightSurchargeRow] = await Promise.all([
    c.env.DB.prepare("SELECT value FROM params WHERE key='base_fee' AND category='delivery'").first<{value:string}>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key='rate_per_km' AND category='delivery'").first<{value:string}>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key='min_fee' AND category='delivery'").first<{value:string}>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key='weight_threshold' AND category='delivery'").first<{value:string}>(),
    c.env.DB.prepare("SELECT value FROM params WHERE key='weight_surcharge' AND category='delivery'").first<{value:string}>(),
  ])
  const baseFee = parseFloat(baseFeeRow?.value ?? '25')
  const ratePerKm = parseFloat(rateRow?.value ?? '3')
  const minFee = parseFloat(minRow?.value ?? '20')
  const weightThresh = parseFloat(weightThreshRow?.value ?? '5')
  const weightSurcharge = parseFloat(weightSurchargeRow?.value ?? '10')

  async function geocode(address: string): Promise<{lat:number;lng:number}|null> {
    if (!c.env.GOOGLE_MAPS_API_KEY) return null
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=gh&key=${c.env.GOOGLE_MAPS_API_KEY}`
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      const data = await res.json<any>()
      if (data.status !== 'OK' || !data.results[0]) return null
      return data.results[0].geometry.location
    } catch { return null }
  }

  function calcCost(distKm: number, weightKg: number): number {
    const weightExtra = weightKg > weightThresh ? weightSurcharge : 0
    return Math.max(minFee, baseFee + distKm * ratePerKm + weightExtra)
  }

  function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
    return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i])
    if (row.every(c => !c)) continue // skip empty rows

    const senderName = col(row, 'sender_name') || col(row, 'customer')
    const recipientName = col(row, 'recipient_name')
    const recipientPhone = col(row, 'recipient_phone')
    const senderPhone = col(row, 'sender_phone') || col(row, 'phone')
    const senderAddress = col(row, 'sender_address')
    const recipientAddress = col(row, 'recipient_address') || col(row, 'destination')
    const description = col(row, 'description')
    const weightStr = col(row, 'weight')
    const costStr = col(row, 'cost')
    const paymentRaw = col(row, 'payment').toLowerCase()
    const specialInstructions = col(row, 'special') || col(row, 'note') || col(row, 'instruction')

    if (!senderName) {
      errors.push(`Row ${i + 1}: missing sender name — skipped`)
      continue
    }

    // Use a placeholder destination if none provided — will be filled via location request
    const effectiveAddress = recipientAddress || 'Awaiting location from recipient'

    const paymentMethod = paymentRaw === 'prepaid' ? 'prepaid' : paymentRaw === 'invoice' ? 'invoice' : 'cod'
    const weight = weightStr ? parseFloat(weightStr) : 0
    let cost = costStr ? parseFloat(costStr) : undefined
    let geocodeFailed = false

    // Auto-calculate cost using geocoding if not provided
    if (!cost || isNaN(cost)) {
      cost = undefined
      if (c.env.GOOGLE_MAPS_API_KEY && senderAddress && recipientAddress) {
        const [pickup, dropoff] = await Promise.all([
          geocode(senderAddress),
          geocode(recipientAddress),
        ])
        if (pickup && dropoff) {
          const distKm = haversine(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng)
          cost = Math.round(calcCost(distKm, !isNaN(weight) ? weight : 0) * 100) / 100
        } else {
          geocodeFailed = true
        }
      } else if (recipientAddress) {
        geocodeFailed = false // has address, just no API key
      } else {
        geocodeFailed = true // no address at all
      }
    }

    const descriptionFull = [
      description,
      recipientName ? `Recipient: ${recipientName}` : '',
      recipientPhone ? `(${recipientPhone})` : '',
      senderAddress ? `| Pickup: ${senderAddress}` : '',
      specialInstructions ? `| Notes: ${specialInstructions}` : '',
      geocodeFailed ? '[AWAITING_LOCATION]' : '',
    ].filter(Boolean).join(' ')

    try {
      const order = await createOrder(c.env, {
        branchId,
        status: 'pending',
        customerName: senderName,
        customerPhone: senderPhone || undefined,
        destination: effectiveAddress,
        description: descriptionFull || undefined,
        weight: !isNaN(weight) && weight > 0 ? weight : undefined,
        cost: cost,
        paymentMethod: paymentMethod as 'prepaid' | 'cod' | 'invoice',
        createdBy: user.sub,
      })
      results.push(order.id)

      // If geocoding failed and we have a recipient phone, send WhatsApp/SMS location request
      if (geocodeFailed && recipientPhone) {
        try {
          const token = crypto.randomUUID().replace(/-/g, '')
          await c.env.KV.put(
            `loc-req:${token}`,
            JSON.stringify({ orderId: order.id, recipientPhone, recipientName: recipientName || senderName, senderName, description: description || 'an item' }),
            { expirationTtl: 60 * 60 * 24 * 7 }, // 7 days
          )
          const link = `https://pullupcustomer.aegisassetllc.com/locate?t=${token}`
          const msg = `Hello${recipientName ? ` ${recipientName}` : ''}, PullUp Delivery is delivering *${description || 'an item'}* on behalf of *${senderName}*. Kindly click the link to share your exact location so we can complete your delivery: ${link}`

          // WhatsApp first (priority), then SMS fallback
          const waResult = await sendWhatsApp(c.env, recipientPhone, msg)
          if (!waResult.ok && !waResult.skipped) {
            await sendSms(c.env, recipientPhone, msg)
          } else if (waResult.skipped) {
            await sendSms(c.env, recipientPhone, msg)
          }

          locationRequested++
        } catch { /* non-blocking — order is still created */ }
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${(err as Error).message}`)
    }
  }

  return c.json({
    imported: results.length,
    skipped: errors.length,
    locationRequested,
    errors: errors.slice(0, 10),
  })
})

// CSV export
app.get('/export.csv', requireAuth(), async c => {
  const branchId = getBranchFilter(c)
  const { items } = await listOrders(c.env, { branchId: branchId === '__ALL__' ? undefined : branchId, limit: 200 })
  const header = ['id', 'status', 'customer', 'phone', 'destination', 'zone', 'cost', 'assignedTo', 'createdAt']
  const rows = items.map(o =>
    [o.id, o.status, o.customerName, o.customerPhone ?? '', o.destination, o.destinationZone ?? '', o.cost ?? '', o.assignedTo ?? '', o.createdAt]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  )
  return new Response([header.join(','), ...rows].join('\n'), {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="orders-${Date.now()}.csv"` },
  })
})

export default app
