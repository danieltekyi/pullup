import type { Env } from '../env'
import type { Order } from '@pullup/shared'
import { findSlaAtRisk } from '../repos/orders'
import { sendEmail } from './notifications/email'
import { sendPushToUser } from './notifications/push'

/**
 * Watches the SLA deadline that every order already carries.
 *
 * sla_by has been written on order create and update since the schema was
 * written, and no code path ever read it. A missed deadline produced no signal
 * anywhere — the first anyone knew was a customer asking where their parcel
 * was. This closes that loop using the partner-poll cron that already runs, so
 * it needs no new trigger.
 */

/**
 * How long to stay quiet after alerting on a given order.
 *
 * The cron fires every five minutes. Without this, a single order sitting past
 * its deadline for an afternoon would generate roughly forty identical alerts
 * and train whoever receives them to ignore the lot.
 */
const REALERT_AFTER_MS = 60 * 60 * 1000

/** Deadlines this close are treated as about to breach. */
const AT_RISK_WINDOW_MINUTES = 30

const seenKey = (orderId: string) => `sla:alerted:${orderId}`

function line(o: Order): string {
  const who = o.assignedTo ? `rider ${o.assignedTo}` : 'nobody yet'
  return `${o.id} — ${o.status}, due ${o.slaBy}, ${who}, to ${o.destination ?? 'unknown destination'}`
}

function html(breached: Order[], atRisk: Order[]): string {
  const section = (title: string, rows: Order[]) =>
    rows.length
      ? `<h3 style="font:600 15px system-ui;margin:18px 0 6px">${title} (${rows.length})</h3>
         <ul style="font:14px/1.6 system-ui;padding-left:18px;margin:0">
           ${rows.map(o => `<li>${line(o)}</li>`).join('')}
         </ul>`
      : ''
  return `<div style="font:14px system-ui;color:#0B1020">
    <h2 style="font:700 18px system-ui;margin:0 0 4px">PullUp — SLA alert</h2>
    <p style="color:#5A6070;margin:0">Generated ${new Date().toISOString()}</p>
    ${section('Past deadline', breached)}
    ${section('Due within 30 minutes', atRisk)}
  </div>`
}

/**
 * Returns only the orders not alerted on recently.
 *
 * Deliberately does not record anything — see markAlerted. If this both read
 * and wrote, an alert that failed to reach anyone would still be suppressed for
 * an hour, turning a delivery failure into a silent one.
 *
 * If KV is unavailable the order is treated as unseen: a duplicate alert is a
 * far better failure than a missing one.
 */
async function unalertedRecently(env: Env, orders: Order[]): Promise<Order[]> {
  const now = Date.now()
  const fresh: Order[] = []
  for (const o of orders) {
    try {
      const last = await env.KV.get(seenKey(o.id))
      if (last && now - Number(last) < REALERT_AFTER_MS) continue
      fresh.push(o)
    } catch {
      fresh.push(o)
    }
  }
  return fresh
}

/** Starts the quiet period. Called only once an alert has actually landed. */
async function markAlerted(env: Env, orders: Order[]): Promise<void> {
  const now = String(Date.now())
  await Promise.all(
    orders.map(o =>
      env.KV
        .put(seenKey(o.id), now, { expirationTtl: Math.ceil((REALERT_AFTER_MS * 2) / 1000) })
        .catch(() => undefined),
    ),
  )
}

export async function slaSweep(env: Env): Promise<{
  breached: number
  atRisk: number
  alerted: number
  notified: string[]
}> {
  const { breached, atRisk } = await findSlaAtRisk(env, AT_RISK_WINDOW_MINUTES)
  if (!breached.length && !atRisk.length) {
    return { breached: 0, atRisk: 0, alerted: 0, notified: [] }
  }

  const fresh = await unalertedRecently(env, [...breached, ...atRisk])
  if (!fresh.length) {
    return { breached: breached.length, atRisk: atRisk.length, alerted: 0, notified: [] }
  }

  const freshIds = new Set(fresh.map(o => o.id))
  const freshBreached = breached.filter(o => freshIds.has(o.id))
  const freshAtRisk = atRisk.filter(o => freshIds.has(o.id))

  // Dispatch is whoever can actually act on this: managers and admins.
  // Queried directly rather than through listUsers, which returns untyped rows.
  const res = await env.DB.prepare(
    `SELECT id, email FROM users
      WHERE status = 'active' AND role IN ('manager', 'super-admin') AND email IS NOT NULL`,
  ).all<{ id: string; email: string }>()
  const recipients = res.results ?? []

  const notified: string[] = []
  await Promise.all(
    recipients.map(async u => {
      // Both helpers report failure by return value rather than by throwing, so
      // settling tells us nothing. Checking only that the promise fulfilled
      // would mark a rejected email as delivered and silence the warning below
      // — the exact failure this sweep exists to prevent.
      const [mail, push] = await Promise.allSettled([
        sendEmail(env, {
          to: u.email,
          subject: freshBreached.length
            ? `PullUp: ${freshBreached.length} delivery SLA breached`
            : `PullUp: ${freshAtRisk.length} delivery SLA at risk`,
          html: html(freshBreached, freshAtRisk),
        }),
        sendPushToUser(env, u.id, {
          title: freshBreached.length ? 'SLA breached' : 'SLA at risk',
          body: `${freshBreached.length} past deadline, ${freshAtRisk.length} due soon.`,
          url: '/orders',
        }),
      ])

      const mailed = mail.status === 'fulfilled' && mail.value.ok === true
      const pushed = push.status === 'fulfilled' && push.value.sent > 0

      if (mail.status === 'fulfilled' && !mail.value.ok && !mail.value.skipped) {
        console.error(`SLA alert email to ${u.email} rejected:`, mail.value.error ?? mail.value.status)
      }
      if (mailed || pushed) notified.push(u.email)
    }),
  )

  if (!notified.length) {
    // Loud, because a silent SLA watcher is worse than none — it creates the
    // belief that someone is watching. Nothing is marked as alerted here, so
    // the next run retries rather than starting a quiet period on an alert
    // that never arrived.
    console.error(
      `SLA SWEEP FOUND ${freshBreached.length} BREACHED AND ${freshAtRisk.length} AT RISK BUT NOTIFIED NOBODY. ` +
        'Check that an active manager or super-admin exists, that RESEND_API_KEY is set, ' +
        'and that FROM_EMAIL uses a domain verified with the email provider.',
    )
  } else {
    await markAlerted(env, fresh)
  }

  return {
    breached: breached.length,
    atRisk: atRisk.length,
    alerted: fresh.length,
    notified,
  }
}
