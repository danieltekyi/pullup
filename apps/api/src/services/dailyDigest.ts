import type { Env } from '../env'
import { sendEmail } from './notifications/email'

/**
 * The morning read on yesterday.
 *
 * There was no scheduled reporting of any kind: to know how yesterday went,
 * somebody had to open the console and work it out. This is the five numbers
 * that decide what today looks like, sent before anyone asks.
 *
 * Deliberately one email a day rather than a dashboard. A dashboard is
 * something you have to remember to look at.
 */

const DIGEST_HOUR_UTC = 6 // 06:00 UTC is 06:00 in Ghana — before the round starts.

const digestKey = (day: string) => `digest:sent:${day}`

interface Digest {
  day: string
  created: number
  delivered: number
  failed: number
  cancelled: number
  revenue: number
  onTimeRate: number | null
  codOutstanding: number
  openNow: number
  blockedRiders: number
  ridersWithoutWork: number
  topFailureReason?: string
}

async function gather(env: Env, day: string): Promise<Digest> {
  const from = `${day}T00:00:00.000Z`
  const to = `${day}T23:59:59.999Z`

  const counts = await env.DB.prepare(
    `SELECT COUNT(*) AS created,
            SUM(CASE WHEN status IN ('delivered','confirmed','awaiting_confirmation') THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            COALESCE(SUM(cost), 0) AS revenue
       FROM orders
      WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?`,
  ).bind(from, to).first<Record<string, number>>()

  // Measured against orders delivered yesterday rather than raised yesterday:
  // an order raised late and delivered today belongs to today's number.
  const sla = await env.DB.prepare(
    `SELECT SUM(CASE WHEN delivered_at <= sla_by THEN 1 ELSE 0 END) AS on_time,
            COUNT(*) AS measured
       FROM orders
      WHERE deleted_at IS NULL AND sla_by IS NOT NULL
        AND delivered_at IS NOT NULL AND delivered_at >= ? AND delivered_at <= ?`,
  ).bind(from, to).first<{ on_time: number; measured: number }>()

  const cod = await env.DB.prepare(
    `SELECT COALESCE(SUM(cod_collected), 0) AS outstanding
       FROM orders
      WHERE deleted_at IS NULL AND payment_method = 'cod'
        AND cod_collected IS NOT NULL AND revenue_status != 'paid'`,
  ).first<{ outstanding: number }>()

  const open = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM orders
      WHERE deleted_at IS NULL AND status IN ('pending','assigned','picked_up','in_transit')`,
  ).first<{ n: number }>()

  const blocked = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM riders
      WHERE deleted_at IS NULL AND status != 'inactive' AND compliance_status = 'blocked'`,
  ).first<{ n: number }>()

  // An active rider who was given nothing. Either capacity going to waste or a
  // rider about to look for work elsewhere.
  const idle = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM riders r
      WHERE r.deleted_at IS NULL AND r.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM orders o
           WHERE o.assigned_to = r.id AND o.deleted_at IS NULL
             AND o.assigned_at >= ? AND o.assigned_at <= ?
        )`,
  ).bind(from, to).first<{ n: number }>()

  const reason = await env.DB.prepare(
    `SELECT failure_reason AS reason, COUNT(*) AS n
       FROM orders
      WHERE deleted_at IS NULL AND status = 'failed'
        AND failed_at >= ? AND failed_at <= ? AND failure_reason IS NOT NULL
      GROUP BY reason ORDER BY n DESC LIMIT 1`,
  ).bind(from, to).first<{ reason: string; n: number }>()

  const measured = sla?.measured ?? 0
  return {
    day,
    created: counts?.created ?? 0,
    delivered: counts?.delivered ?? 0,
    failed: counts?.failed ?? 0,
    cancelled: counts?.cancelled ?? 0,
    revenue: counts?.revenue ?? 0,
    // Null rather than 100%. With no deadlines met or missed there is no rate,
    // and reporting a fabricated one is worse than reporting none.
    onTimeRate: measured > 0 ? Math.round(((sla?.on_time ?? 0) / measured) * 100) : null,
    codOutstanding: cod?.outstanding ?? 0,
    openNow: open?.n ?? 0,
    blockedRiders: blocked?.n ?? 0,
    ridersWithoutWork: idle?.n ?? 0,
    topFailureReason: reason?.reason,
  }
}

function render(d: Digest): string {
  const cedis = (n: number) => `GHS ${n.toFixed(2)}`
  const tile = (label: string, value: string, tone = '#0B1020') =>
    `<td style="padding:12px 16px;border:1px solid #E6E8EC;border-radius:10px">
       <div style="font:600 11px system-ui;color:#5A6070;text-transform:uppercase;letter-spacing:.05em">${label}</div>
       <div style="font:700 22px system-ui;color:${tone};margin-top:4px">${value}</div>
     </td>`

  // Only the things worth acting on. A digest that lists everything gets
  // skimmed, and then the one line that mattered gets skimmed too.
  const attention: string[] = []
  if (d.blockedRiders > 0) {
    attention.push(`${d.blockedRiders} rider${d.blockedRiders === 1 ? '' : 's'} cannot be given work until documents are renewed.`)
  }
  if (d.failed > 0) {
    attention.push(`${d.failed} delivery failed${d.topFailureReason ? ` — most often: ${d.topFailureReason.replace(/_/g, ' ')}` : ''}.`)
  }
  if (d.onTimeRate !== null && d.onTimeRate < 90) {
    attention.push(`On-time rate was ${d.onTimeRate}%.`)
  }
  if (d.ridersWithoutWork > 0) {
    attention.push(`${d.ridersWithoutWork} active rider${d.ridersWithoutWork === 1 ? '' : 's'} had no assignments.`)
  }
  if (d.codOutstanding > 0) {
    attention.push(`${cedis(d.codOutstanding)} cash collected and not yet banked.`)
  }

  const attentionHtml = attention.length
    ? `<div style="margin-top:22px;padding:16px;background:#FFF4EF;border-left:3px solid #FF5A1F;border-radius:6px">
         <div style="font:700 14px system-ui;color:#0B1020">Worth a look</div>
         <ul style="font:14px/1.7 system-ui;color:#0B1020;margin:8px 0 0;padding-left:18px">
           ${attention.map(a => `<li>${a}</li>`).join('')}
         </ul>
       </div>`
    : `<p style="font:14px system-ui;color:#5A6070;margin-top:22px">Nothing needs attention this morning.</p>`

  return `<div style="font-family:system-ui,sans-serif;max-width:640px">
    <h2 style="font:700 20px system-ui;color:#0B1020;margin:0">PullUp — ${d.day}</h2>
    <p style="font:14px system-ui;color:#5A6070;margin:4px 0 18px">Yesterday's numbers.</p>
    <table style="border-collapse:separate;border-spacing:8px 8px;width:100%">
      <tr>
        ${tile('Orders', String(d.created))}
        ${tile('Delivered', String(d.delivered))}
        ${tile('Failed', String(d.failed), d.failed > 0 ? '#C2410C' : '#0B1020')}
      </tr>
      <tr>
        ${tile('Revenue', cedis(d.revenue))}
        ${tile('On time', d.onTimeRate === null ? '—' : `${d.onTimeRate}%`)}
        ${tile('Open now', String(d.openNow))}
      </tr>
    </table>
    ${attentionHtml}
    <p style="font:12px system-ui;color:#8A9099;margin-top:24px">
      Sent automatically each morning. Figures come straight from the delivery records.
    </p>
  </div>`
}

/**
 * Sends yesterday's digest, once.
 *
 * Called from the five-minute cron, so it has to decide for itself whether this
 * is the run that should send. The KV marker is keyed by date, which makes a
 * duplicate impossible even if the cron fires twice in the same minute.
 */
export async function maybeSendDailyDigest(env: Env, now: Date = new Date()): Promise<{ sent: boolean; reason?: string }> {
  if (now.getUTCHours() < DIGEST_HOUR_UTC) return { sent: false, reason: 'too early' }

  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
  const key = digestKey(yesterday)

  try {
    if (await env.KV.get(key)) return { sent: false, reason: 'already sent' }
  } catch {
    // KV unavailable. Skip rather than risk a digest every five minutes for the
    // rest of the day — unlike an SLA breach, a missed digest costs nothing.
    return { sent: false, reason: 'kv unavailable' }
  }

  const digest = await gather(env, yesterday)
  const to = env.NOTIFY_EMAIL
  if (!to) {
    console.error('DAILY DIGEST HAS NOWHERE TO GO — NOTIFY_EMAIL is unset.')
    return { sent: false, reason: 'no recipient' }
  }

  const result = await sendEmail(env, {
    to,
    subject: `PullUp — ${yesterday}: ${digest.created} orders, ${digest.delivered} delivered`,
    html: render(digest),
  })

  if (!result.ok) {
    // Not marked as sent, so the next run retries.
    console.error('daily digest failed to send:', result.error ?? result.status)
    return { sent: false, reason: 'send failed' }
  }

  await env.KV.put(key, new Date().toISOString(), { expirationTtl: 60 * 60 * 24 * 7 }).catch(() => undefined)
  return { sent: true }
}
