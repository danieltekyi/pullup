import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { requireAuth } from '../middleware/access'
import { forbidden, notFound } from '../lib/errors'
import { findOrder, createOrder } from '../repos/orders'
import { logOrderEvent } from '../repos/orderEvents'
import { findOrCreateCustomer } from '../repos/customers'
import { rowToObj } from '../lib/db'

/**
 * Self-serve endpoints for a logged-in partner.
 *
 * The portal was read-only: a partner could look at their deliveries and
 * download a CSV, but every actual booking still happened over WhatsApp or a
 * spreadsheet somebody re-keyed. That re-keying is where the errors come from
 * and where the dispatcher's morning goes.
 */

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

/** Partner identity comes from the token, never from the request body. */
function partnerIdOf(c: { get: (k: 'user') => { role: string; partnerId?: string } | undefined }): string {
  const user = c.get('user')!
  if (user.role !== 'partner' || !user.partnerId) {
    throw forbidden('partner account required')
  }
  return user.partnerId
}

/**
 * Addresses this partner has actually delivered to, most recent first.
 *
 * Derived from their own order history rather than a separate address book,
 * because a saved-address feature nobody populates is worse than none — it
 * shows an empty list and teaches people not to look.
 */
app.get('/addresses', requireAuth(), async c => {
  const partnerId = partnerIdOf(c)
  const res = await c.env.DB.prepare(
    `SELECT customer_name, customer_phone, destination, destination_zone,
            COUNT(*) AS times_used, MAX(created_at) AS last_used
       FROM orders
      WHERE partner_id = ? AND deleted_at IS NULL AND customer_phone IS NOT NULL
      GROUP BY customer_phone, destination
      ORDER BY last_used DESC
      LIMIT 50`,
  )
    .bind(partnerId)
    .all<Record<string, unknown>>()

  return c.json({
    addresses: (res.results ?? []).map(r => rowToObj(r)),
  })
})

const reorderSchema = z.object({
  orderId: z.string().min(1),
  /** Lets a partner repeat a delivery to the same place with a new parcel. */
  description: z.string().max(500).optional(),
  weight: z.number().nonnegative().optional(),
  parcelCount: z.number().int().positive().optional(),
})

/**
 * Repeats a previous delivery.
 *
 * Copies destination and recipient from the original and nothing else. Price,
 * status and timestamps are recalculated: carrying the old cost forward would
 * let a partner pin a rate from three months ago by reordering an old job.
 */
app.post('/reorder', requireAuth(), async c => {
  const partnerId = partnerIdOf(c)
  const body = reorderSchema.parse(await c.req.json())

  const source = await findOrder(c.env, body.orderId)
  if (!source) throw notFound('order not found')
  // Checked rather than filtered: without this a partner could reorder any
  // order in the system by guessing an id, and see the recipient details come
  // back in the response.
  if (source.partnerId !== partnerId) throw forbidden('not your order')

  let customerId: string | undefined
  if (source.customerPhone) {
    const cust = await findOrCreateCustomer(c.env, {
      branchId: source.branchId,
      phone: source.customerPhone,
      name: source.customerName,
      address: source.destination,
    })
    customerId = cust.id
  }

  const order = await createOrder(c.env, {
    branchId: source.branchId,
    status: 'pending',
    priority: source.priority,
    customerId,
    customerName: source.customerName,
    customerPhone: source.customerPhone,
    destination: source.destination,
    destinationZone: source.destinationZone,
    originZone: source.originZone,
    weight: body.weight ?? source.weight,
    parcelCount: body.parcelCount ?? source.parcelCount,
    description: body.description ?? source.description,
    paymentMethod: source.paymentMethod,
    partnerId,
    createdBy: c.get('user')!.sub,
  })

  await logOrderEvent(c.env, {
    orderId: order.id,
    type: 'created',
    actor: { sub: c.get('user')!.sub, role: 'partner', email: c.get('user')!.email },
    after: order,
    note: `Reordered from ${source.id}`,
  })

  return c.json(order, 201)
})

/**
 * Spend and volume for a period, computed in SQL.
 *
 * The portal was doing this in the browser over whatever page of orders it had
 * fetched, which meant the totals silently under-reported once a partner had
 * more history than one page.
 */
app.get('/statement', requireAuth(), async c => {
  const partnerId = partnerIdOf(c)
  const from = c.req.query('from')
  const to = c.req.query('to')

  const parts = ['partner_id = ?', 'deleted_at IS NULL']
  const values: unknown[] = [partnerId]
  if (from) { parts.push('created_at >= ?'); values.push(from) }
  if (to) { parts.push('created_at <= ?'); values.push(to) }
  const where = parts.join(' AND ')

  const totals = await c.env.DB.prepare(
    `SELECT COUNT(*) AS orders,
            COALESCE(SUM(cost), 0) AS spend,
            SUM(CASE WHEN status IN ('delivered','confirmed') THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN cod_collected IS NOT NULL THEN cod_collected ELSE 0 END) AS cod_collected
       FROM orders WHERE ${where}`,
  )
    .bind(...values)
    .first<Record<string, unknown>>()

  const byMonth = await c.env.DB.prepare(
    `SELECT strftime('%Y-%m', created_at) AS label,
            COUNT(*) AS orders,
            COALESCE(SUM(cost), 0) AS spend
       FROM orders WHERE ${where}
      GROUP BY label ORDER BY label DESC LIMIT 24`,
  )
    .bind(...values)
    .all<Record<string, unknown>>()

  const byZone = await c.env.DB.prepare(
    `SELECT COALESCE(destination_zone, 'Unzoned') AS zone,
            COUNT(*) AS orders,
            COALESCE(SUM(cost), 0) AS spend
       FROM orders WHERE ${where}
      GROUP BY zone ORDER BY orders DESC LIMIT 20`,
  )
    .bind(...values)
    .all<Record<string, unknown>>()

  return c.json({
    totals: rowToObj(totals),
    byMonth: (byMonth.results ?? []).map(r => rowToObj(r)).reverse(),
    byZone: (byZone.results ?? []).map(r => rowToObj(r)),
  })
})

/** On-time rate and failure reasons, so a partner can see service quality. */
app.get('/performance', requireAuth(), async c => {
  const partnerId = partnerIdOf(c)

  const sla = await c.env.DB.prepare(
    `SELECT
        SUM(CASE WHEN delivered_at IS NOT NULL AND sla_by IS NOT NULL AND delivered_at <= sla_by THEN 1 ELSE 0 END) AS on_time,
        SUM(CASE WHEN delivered_at IS NOT NULL AND sla_by IS NOT NULL AND delivered_at > sla_by THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
       FROM orders
      WHERE partner_id = ? AND deleted_at IS NULL`,
  )
    .bind(partnerId)
    .first<{ on_time: number; late: number; completed: number }>()

  const failures = await c.env.DB.prepare(
    `SELECT COALESCE(failure_reason, 'other') AS reason, COUNT(*) AS n
       FROM orders
      WHERE partner_id = ? AND deleted_at IS NULL AND status = 'failed'
      GROUP BY reason ORDER BY n DESC`,
  )
    .bind(partnerId)
    .all<{ reason: string; n: number }>()

  const measured = (sla?.on_time ?? 0) + (sla?.late ?? 0)
  return c.json({
    completed: sla?.completed ?? 0,
    onTime: sla?.on_time ?? 0,
    late: sla?.late ?? 0,
    // Null rather than a fabricated 100%: with no deadlines recorded there is
    // no on-time rate to report, and claiming one would be worse than a blank.
    onTimeRate: measured > 0 ? Math.round(((sla?.on_time ?? 0) / measured) * 100) : null,
    failureReasons: failures.results ?? [],
  })
})

export default app
