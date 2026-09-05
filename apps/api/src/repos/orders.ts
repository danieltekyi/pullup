import type { Env } from '../env'
import { rowToObj, buildUpdate, encodeCursor, decodeCursor } from '../lib/db'
import { newId, nowIso } from '../lib/ids'
import type { Order, OrderStatus } from '@pullup/shared'
import { conflict, notFound } from '../lib/errors'

const JSON_COLS = ['proof']

export interface ListFilters {
  branchId?: string
  riderId?: string
  status?: OrderStatus[]
  from?: string
  to?: string
  q?: string
  partnerId?: string
  customerId?: string
  limit?: number
  cursor?: string
}

export async function findOrder(env: Env, id: string): Promise<Order | undefined> {
  const row = await env.DB.prepare(`SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<Record<string, unknown>>()
  return rowToObj<Order>(row, JSON_COLS)
}

export async function findByPartnerRef(env: Env, partnerId: string, partnerOrderId: string): Promise<Order | undefined> {
  const row = await env.DB.prepare(
    `SELECT * FROM orders WHERE partner_id = ? AND partner_order_id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(partnerId, partnerOrderId)
    .first<Record<string, unknown>>()
  return rowToObj<Order>(row, JSON_COLS)
}

export async function listOrders(env: Env, f: ListFilters): Promise<{ items: Order[]; cursor?: string }> {
  const limit = Math.min(f.limit ?? 50, 200)
  const parts: string[] = ['deleted_at IS NULL']
  const values: unknown[] = []

  if (f.branchId && f.branchId !== '__ALL__') {
    parts.push('branch_id = ?')
    values.push(f.branchId)
  }
  if (f.riderId) {
    parts.push('assigned_to = ?')
    values.push(f.riderId)
  }
  if (f.status?.length) {
    parts.push(`status IN (${f.status.map(() => '?').join(',')})`)
    values.push(...f.status)
  }
  if (f.from) {
    parts.push('created_at >= ?')
    values.push(f.from)
  }
  if (f.to) {
    parts.push('created_at <= ?')
    values.push(f.to)
  }
  if (f.partnerId) {
    parts.push('partner_id = ?')
    values.push(f.partnerId)
  }
  if (f.customerId) {
    parts.push('customer_id = ?')
    values.push(f.customerId)
  }
  if (f.q) {
    parts.push('(customer_name LIKE ? OR destination LIKE ? OR id LIKE ? OR customer_phone LIKE ?)')
    const like = `%${f.q}%`
    values.push(like, like, like, like)
  }

  const cursorObj = decodeCursor(f.cursor) as { created_at?: string; id?: string } | undefined
  if (cursorObj?.created_at && cursorObj?.id) {
    parts.push('(created_at < ? OR (created_at = ? AND id < ?))')
    values.push(cursorObj.created_at, cursorObj.created_at, cursorObj.id)
  }

  const where = parts.join(' AND ')
  const sql = `SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
  values.push(limit + 1)
  const res = await env.DB.prepare(sql).bind(...values).all<Record<string, unknown>>()
  const rows = res.results ?? []
  const has = rows.length > limit
  const items = rows.slice(0, limit).map(r => rowToObj<Order>(r, JSON_COLS)!) 
  const cursor = has
    ? encodeCursor({ created_at: items[items.length - 1].createdAt, id: items[items.length - 1].id })
    : undefined
  return { items, cursor }
}

/**
 * Counts every order matching the filter, grouped by status.
 *
 * The dashboard previously derived these by fetching a page of orders and
 * calling .filter() on it. Because listOrders caps at 200 rows, the counts
 * silently stopped rising once the business passed 200 orders — the dashboard
 * reported 200 with no error and no way to tell it was wrong.
 */
export async function orderStatusCounts(
  env: Env,
  branchId?: string,
): Promise<{ total: number; byStatus: Record<string, number> }> {
  const parts: string[] = ['deleted_at IS NULL']
  const values: unknown[] = []
  if (branchId && branchId !== '__ALL__') {
    parts.push('branch_id = ?')
    values.push(branchId)
  }
  const res = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM orders WHERE ${parts.join(' AND ')} GROUP BY status`,
  )
    .bind(...values)
    .all<{ status: string; n: number }>()

  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of res.results ?? []) {
    byStatus[row.status] = row.n
    total += row.n
  }
  return { total, byStatus }
}

export type TrendPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly'

/**
 * strftime patterns per period.
 *
 * Exported so the label format is testable without a database. %W is
 * Monday-based and zero-padded, so labels sort lexically in the order the
 * periods actually occur. The previous implementation built labels like
 * "W5-2026" in JavaScript, which sorted W10 before W5 and produced a chart with
 * the weeks out of order.
 */
export const TREND_FORMATS: Record<TrendPeriod, string> = {
  daily: '%Y-%m-%d',
  weekly: '%Y-W%W',
  monthly: '%Y-%m',
  yearly: '%Y',
}

/**
 * Order volume and revenue per period, aggregated in SQL over the whole table
 * rather than over a truncated page.
 */
export async function orderTrend(
  env: Env,
  period: TrendPeriod,
  branchId?: string,
  limit = 365,
): Promise<{ label: string; count: number; revenue: number }[]> {
  const fmt = TREND_FORMATS[period] ?? TREND_FORMATS.daily

  const parts: string[] = ['deleted_at IS NULL']
  const values: unknown[] = []
  if (branchId && branchId !== '__ALL__') {
    parts.push('branch_id = ?')
    values.push(branchId)
  }

  const res = await env.DB.prepare(
    `SELECT strftime(?, created_at) AS label,
            COUNT(*)                AS count,
            COALESCE(SUM(cost), 0)  AS revenue
       FROM orders
      WHERE ${parts.join(' AND ')}
      GROUP BY label
      ORDER BY label DESC
      LIMIT ?`,
  )
    .bind(fmt, ...values, limit)
    .all<{ label: string; count: number; revenue: number }>()

  // Newest-first from SQL so the LIMIT keeps recent periods; reversed here so
  // the chart reads left to right.
  return (res.results ?? []).reverse()
}

/**
 * Orders whose SLA deadline has passed, or is about to, and which have not
 * reached a terminal state.
 *
 * sla_by has been written on every order since the schema was created and read
 * by nothing, so a missed deadline produced no signal anywhere.
 */
export async function findSlaAtRisk(
  env: Env,
  withinMinutes = 30,
  limit = 100,
): Promise<{ breached: Order[]; atRisk: Order[] }> {
  const now = new Date()
  const soon = new Date(now.getTime() + withinMinutes * 60_000).toISOString()
  const nowIso = now.toISOString()

  // Terminal states are excluded: an order that already finished cannot breach.
  const OPEN = ['pending', 'assigned', 'picked_up', 'in_transit']
  const res = await env.DB.prepare(
    `SELECT * FROM orders
      WHERE deleted_at IS NULL
        AND sla_by IS NOT NULL
        AND sla_by <= ?
        AND status IN (${OPEN.map(() => '?').join(',')})
      ORDER BY sla_by ASC
      LIMIT ?`,
  )
    .bind(soon, ...OPEN, limit)
    .all<Record<string, unknown>>()

  const rows = (res.results ?? []).map(r => rowToObj<Order>(r, JSON_COLS)!)
  return {
    breached: rows.filter(o => (o.slaBy ?? '') <= nowIso),
    atRisk: rows.filter(o => (o.slaBy ?? '') > nowIso),
  }
}

export async function createOrder(
  env: Env,
  data: Partial<Order> & { branchId: string; customerName: string; destination: string; paymentMethod: string },
): Promise<Order> {
  const id = data.id ?? newId('ord')
  const now = nowIso()
  const cols: Record<string, unknown> = {
    id,
    branch_id: data.branchId,
    status: data.status ?? 'pending',
    priority: data.priority ?? 'normal',
    customer_id: data.customerId,
    customer_name: data.customerName,
    customer_phone: data.customerPhone,
    destination: data.destination,
    destination_zone: data.destinationZone,
    origin_zone: data.originZone,
    weight: data.weight,
    parcel_count: data.parcelCount,
    description: data.description,
    cost: data.cost,
    pricing_mode: data.pricingMode,
    payment_method: data.paymentMethod,
    cod_collected: data.codCollected,
    partner_id: data.partnerId,
    partner_order_id: data.partnerOrderId,
    delivery_fee_from_partner: data.deliveryFeeFromPartner,
    revenue_status: data.revenueStatus ?? 'none',
    sla_by: data.slaBy,
    created_by: data.createdBy,
    created_at: now,
    updated_at: now,
    version: 1,
  }
  const keys = Object.keys(cols)
  await env.DB.prepare(
    `INSERT INTO orders (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
  )
    .bind(...keys.map(k => cols[k] ?? null))
    .run()
  return (await findOrder(env, id))!
}

/**
 * Optimistic-concurrency update: bumps version, fails on version mismatch.
 */
export async function updateOrder(env: Env, id: string, patch: Partial<Order>, expectedVersion?: number): Promise<Order> {
  const existing = await findOrder(env, id)
  if (!existing) throw notFound('order not found')
  const version = expectedVersion ?? existing.version
  const { sets, values } = buildUpdate(patch)
  if (!sets) return existing
  const res = await env.DB.prepare(
    `UPDATE orders SET ${sets}, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`,
  )
    .bind(...values, nowIso(), id, version)
    .run()
  if (!res.meta.changes) throw conflict('order was modified by another request; retry')
  return (await findOrder(env, id))!
}

export async function softDeleteOrder(env: Env, id: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE orders SET deleted_at = ?, status = 'cancelled', updated_at = ? WHERE id = ?`,
  )
    .bind(nowIso(), nowIso(), id)
    .run()
}
