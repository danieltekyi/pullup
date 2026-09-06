import type { Env } from '../env'
import { findExpiringDocuments, recomputeRiderCompliance } from '../repos/riderDocuments'
import { documentSpec, isExpired, type DocumentType } from '@pullup/shared'
import { sendSms } from './notifications/sms'
import { sendEmail } from './notifications/email'

/**
 * Watches rider documents for lapse.
 *
 * An expiry date is only useful if something acts on it. A rider whose
 * insurance ran out last Tuesday looks identical to a compliant one unless
 * somebody recomputes, and in the owner-operator model that difference is the
 * company's legal exposure rather than an administrative detail.
 *
 * Two jobs: tell the rider early enough to renew, and flip the rider to blocked
 * the moment cover lapses so dispatch stops offering them work.
 */

/** Rider gets a nudge at each of these, not every day for a month. */
const WARN_AT_DAYS = [30, 14, 7, 3, 1]

const REALERT_AFTER_MS = 20 * 60 * 60 * 1000

const seenKey = (docId: string, bucket: number) => `doc:warned:${docId}:${bucket}`

function daysLeft(expiresOn: string, now: Date): number {
  return Math.floor((Date.parse(expiresOn) - now.getTime()) / 86_400_000)
}

/** The warning step a countdown falls into, or null between steps. */
function warnBucket(days: number): number | null {
  return WARN_AT_DAYS.find(d => days === d) ?? null
}

export async function complianceSweep(env: Env): Promise<{
  checked: number
  expired: number
  warned: number
  blockedRiders: string[]
}> {
  const now = new Date()
  const docs = await findExpiringDocuments(env, Math.max(...WARN_AT_DAYS))

  const expiredRiders = new Set<string>()
  let warned = 0
  let expiredCount = 0

  for (const doc of docs) {
    const spec = documentSpec(doc.type as DocumentType)
    const label = spec?.label ?? doc.type
    if (!doc.expiresOn) continue

    if (isExpired(doc.expiresOn, now)) {
      expiredCount++
      expiredRiders.add(doc.riderId)
      continue
    }

    const bucket = warnBucket(daysLeft(doc.expiresOn, now))
    if (bucket === null) continue

    // Bucketed by threshold rather than by document, so a rider gets one
    // message at 30 days and another at 14 rather than thirty identical ones.
    const key = seenKey(doc.id, bucket)
    try {
      const last = await env.KV.get(key)
      if (last && now.getTime() - Number(last) < REALERT_AFTER_MS) continue
    } catch {
      // KV unavailable — warn anyway. A duplicate reminder beats a silent lapse.
    }

    const when = bucket === 1 ? 'tomorrow' : `in ${bucket} days`
    const sent = await sendSms(
      env,
      doc.riderPhone,
      `PullUp: your ${label} expires ${when} (${doc.expiresOn.slice(0, 10)}). ` +
        'Renew and upload it in the rider app, or you will not be able to take rounds.',
    ).catch(() => undefined)

    if (sent) {
      warned++
      await env.KV.put(key, String(now.getTime()), {
        expirationTtl: Math.ceil((REALERT_AFTER_MS * 2) / 1000),
      }).catch(() => undefined)
    }
  }

  // Recomputed after the pass so a lapse flips the rider to blocked and
  // dispatch refuses them, rather than waiting for their next upload.
  for (const riderId of expiredRiders) {
    await recomputeRiderCompliance(env, riderId).catch(() => undefined)
  }

  if (expiredRiders.size) {
    await notifyManagers(env, docs.filter(d => isExpired(d.expiresOn, now)))
  }

  return {
    checked: docs.length,
    expired: expiredCount,
    warned,
    blockedRiders: [...expiredRiders],
  }
}

async function notifyManagers(
  env: Env,
  expired: Array<{ riderName: string; type: string; expiresOn?: string | null }>,
) {
  const res = await env.DB.prepare(
    `SELECT id, email FROM users
      WHERE status = 'active' AND role IN ('manager', 'super-admin') AND email IS NOT NULL`,
  ).all<{ id: string; email: string }>()
  const recipients = res.results ?? []
  if (!recipients.length) return

  const rows = expired
    .map(d => `<li>${d.riderName} — ${documentSpec(d.type as DocumentType)?.label ?? d.type} expired ${d.expiresOn?.slice(0, 10)}</li>`)
    .join('')

  const html = `<div style="font:14px system-ui;color:#0B1020">
    <h2 style="font:700 18px system-ui;margin:0 0 6px">Riders blocked on compliance</h2>
    <p style="color:#5A6070;margin:0 0 12px">
      These riders can no longer be assigned work until they upload a current document.
    </p>
    <ul style="font:14px/1.6 system-ui;padding-left:18px;margin:0">${rows}</ul>
  </div>`

  let delivered = 0
  for (const u of recipients) {
    const r = await sendEmail(env, {
      to: u.email,
      subject: `PullUp: ${expired.length} rider document(s) expired`,
      html,
    }).catch(() => ({ ok: false }))
    if (r.ok) delivered++
  }

  if (!delivered) {
    console.error(
      `COMPLIANCE SWEEP BLOCKED ${expired.length} RIDER DOCUMENT(S) BUT NOTIFIED NOBODY. ` +
        'Riders will be refused work with no dispatcher told why. ' +
        'Check RESEND_API_KEY and that FROM_EMAIL uses a verified domain.',
    )
  }
}
