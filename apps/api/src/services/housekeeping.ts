import type { Env } from '../env'
import type { Order } from '@pullup/shared'
import { rowToObj } from '../lib/db'
import { nowIso } from '../lib/ids'
import { updateOrder } from '../repos/orders'
import { logOrderEvent } from '../repos/orderEvents'
import { sendPushToUser } from './notifications/push'
import { notifyCustomer } from './customerNotify'

/**
 * Housekeeping the dispatcher would otherwise have to remember.
 *
 * Three states an order can get stuck in, each of which quietly costs
 * something:
 *
 *   awaiting_confirmation — waits for a manager to click. Nobody clicks at
 *     18:00 on a Friday, so revenue sits unrecognised over the weekend.
 *   pending — a partner feed glitch or an abandoned booking leaves rows nobody
 *     will ever action, inflating the queue until the real work is hidden.
 *   assigned — a rider who never opened the notification looks identical to one
 *     who is on their way. The customer finds out first.
 *
 * All three run on the cron that already exists.
 */

/** How long an arrived delivery may sit before it is taken as accepted. */
const AUTO_CONFIRM_AFTER_HOURS = 24

/** How long an unassigned order may sit before it is treated as abandoned. */
const STALE_PENDING_AFTER_HOURS = 48

/** How long an assigned order may sit untouched before the rider is chased. */
const RIDER_NUDGE_AFTER_MINUTES = 45

/** And how long before it stops being the rider's problem. */
const ESCALATE_AFTER_MINUTES = 90

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

async function query(env: Env, sql: string, ...binds: unknown[]): Promise<Order[]> {
  const res = await env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<Order>(r, ['proof'])!)
}

/** The system, for audit entries written by a cron rather than a person. */
const SYSTEM = { sub: 'system:housekeeping', role: 'super-admin' as const, email: 'system@pullup' }

/**
 * Accepts deliveries the customer never disputed.
 *
 * Deliberately conservative: only orders that actually reached the door, and
 * only after a full day with no rejection. The audit entry records that the
 * system did it, so nobody later thinks a manager reviewed it.
 */
export async function autoConfirmDelivered(env: Env): Promise<number> {
  const stuck = await query(
    env,
    `SELECT * FROM orders
      WHERE deleted_at IS NULL
        AND status = 'awaiting_confirmation'
        AND delivered_at IS NOT NULL
        AND delivered_at <= ?
      LIMIT 100`,
    hoursAgo(AUTO_CONFIRM_AFTER_HOURS),
  )

  let confirmed = 0
  for (const order of stuck) {
    try {
      const updated = await updateOrder(env, order.id, {
        status: 'confirmed',
        confirmedAt: nowIso(),
        revenueStatus: order.revenueStatus === 'suspense' ? 'receivable' : order.revenueStatus,
      })
      await logOrderEvent(env, {
        orderId: order.id,
        type: 'confirmed',
        actor: SYSTEM,
        before: order,
        after: updated,
        note: `Auto-confirmed after ${AUTO_CONFIRM_AFTER_HOURS}h with no dispute`,
      })
      confirmed++
    } catch (err) {
      console.error('auto-confirm failed', order.id, (err as Error).message)
    }
  }
  return confirmed
}

/**
 * Cancels orders nobody ever picked up.
 *
 * Only touches orders still pending — never one a rider has started. The
 * customer is told, because an order silently vanishing is how a business loses
 * someone quietly.
 */
export async function cancelStalePending(env: Env): Promise<number> {
  const stale = await query(
    env,
    `SELECT * FROM orders
      WHERE deleted_at IS NULL
        AND status = 'pending'
        AND created_at <= ?
      LIMIT 100`,
    hoursAgo(STALE_PENDING_AFTER_HOURS),
  )

  let cancelled = 0
  for (const order of stale) {
    try {
      const updated = await updateOrder(env, order.id, { status: 'cancelled' })
      await logOrderEvent(env, {
        orderId: order.id,
        type: 'cancelled',
        actor: SYSTEM,
        before: order,
        after: updated,
        note: `Auto-cancelled after ${STALE_PENDING_AFTER_HOURS}h unassigned`,
      })
      await notifyCustomer(env, updated, 'cancelled').catch(() => undefined)
      cancelled++
    } catch (err) {
      console.error('stale cancel failed', order.id, (err as Error).message)
    }
  }
  return cancelled
}

const nudgeKey = (orderId: string, stage: string) => `nudge:${orderId}:${stage}`

/**
 * Chases assigned orders that have not moved, then escalates.
 *
 * A rider who never opened the notification is indistinguishable from one on
 * their way. One push fires on assign and nothing follows it up, so the first
 * person to notice is the customer.
 */
export async function nudgeIdleAssignments(env: Env): Promise<{ nudged: number; escalated: number }> {
  const idle = await query(
    env,
    `SELECT * FROM orders
      WHERE deleted_at IS NULL
        AND status = 'assigned'
        AND assigned_at IS NOT NULL
        AND assigned_at <= ?
        AND assigned_to IS NOT NULL
      ORDER BY assigned_at ASC
      LIMIT 100`,
    minutesAgo(RIDER_NUDGE_AFTER_MINUTES),
  )

  let nudged = 0
  let escalated = 0
  const escalateBefore = minutesAgo(ESCALATE_AFTER_MINUTES)

  for (const order of idle) {
    const overdue = (order.assignedAt ?? '') <= escalateBefore
    const stage = overdue ? 'escalate' : 'nudge'
    const key = nudgeKey(order.id, stage)

    try {
      if (await env.KV.get(key)) continue
    } catch {
      // KV unavailable. A duplicate nudge is better than an order nobody chases.
    }

    if (overdue) {
      // Past the point where nudging the rider again is useful. This is now
      // dispatch's problem, and they can reassign.
      const sent = await notifyManagers(
        env,
        'Delivery not started',
        `${order.customerName} — ${order.destination}. Assigned ${order.assignedAt} and still not picked up. Consider reassigning.`,
      )
      if (sent) escalated++
    } else {
      const r = await sendPushToUser(env, order.assignedTo!, {
        title: 'Delivery still waiting',
        body: `${order.customerName} — ${order.destination}`,
        url: '/',
      }).catch(() => ({ sent: 0 }))
      if (r.sent > 0) nudged++
    }

    await env.KV.put(key, nowIso(), { expirationTtl: 60 * 60 * 12 }).catch(() => undefined)
  }

  return { nudged, escalated }
}

async function notifyManagers(env: Env, title: string, body: string): Promise<boolean> {
  const res = await env.DB.prepare(
    `SELECT id FROM users WHERE status = 'active' AND role IN ('manager', 'super-admin')`,
  ).all<{ id: string }>()
  let any = false
  for (const u of res.results ?? []) {
    const r = await sendPushToUser(env, u.id, { title, body, url: '/orders' }).catch(() => ({ sent: 0 }))
    if (r.sent > 0) any = true
  }
  return any
}

export async function housekeepingSweep(env: Env) {
  // Run independently so one failure does not stop the others.
  const [confirmed, cancelled, nudges] = await Promise.all([
    autoConfirmDelivered(env).catch(err => { console.error('auto-confirm sweep failed', err); return 0 }),
    cancelStalePending(env).catch(err => { console.error('stale sweep failed', err); return 0 }),
    nudgeIdleAssignments(env).catch(err => { console.error('nudge sweep failed', err); return { nudged: 0, escalated: 0 } }),
  ])
  return { confirmed, cancelled, ...nudges }
}
