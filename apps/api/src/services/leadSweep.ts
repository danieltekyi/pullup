import type { Env } from '../env'
import { sendEmail } from './notifications/email'

/**
 * Catches website enquiries that reached nobody.
 *
 * The site stores every enquiry and writes an `unnotified:` marker when neither
 * notification channel worked. That makes the backlog durable and countable,
 * but Pages Functions have no scheduled trigger, so nothing on that side could
 * ever act on it — the marker would sit there unread, which is only marginally
 * better than the log line it replaced.
 *
 * This runs on the cron that already exists. It is the last line: an enquiry
 * that failed both the relay and the direct send still gets in front of someone
 * within the hour, and the contact page's promise of a same-day reply survives
 * a bad afternoon for the email provider.
 */

const SWEPT_KEY = 'leadsweep:last'

/** Enough gap that a transient failure has had a chance to be retried. */
const REALERT_AFTER_MS = 60 * 60 * 1000

export async function unnotifiedLeadSweep(env: Env): Promise<{
  found: number
  alerted: boolean
}> {
  if (!env.SITE_KV) return { found: 0, alerted: false }

  let markers: Array<{ key: string; leadId: string }> = []
  try {
    const page = await env.SITE_KV.list({ prefix: 'unnotified:', limit: 100 })
    markers = page.keys.map(k => ({
      key: k.name,
      // unnotified:<receivedAt>:<leadId>
      leadId: k.name.split(':').slice(2).join(':'),
    }))
  } catch (err) {
    console.error('lead sweep could not read the site store', (err as Error).message)
    return { found: 0, alerted: false }
  }

  if (!markers.length) return { found: 0, alerted: false }

  try {
    const last = await env.KV.get(SWEPT_KEY)
    if (last && Date.now() - Number(last) < REALERT_AFTER_MS) {
      return { found: markers.length, alerted: false }
    }
  } catch {
    // KV unavailable. A duplicate alert about an unread enquiry is fine.
  }

  // Read the leads themselves so the alert names people rather than ids.
  const details: string[] = []
  for (const m of markers.slice(0, 20)) {
    try {
      const raw = await env.SITE_KV.get(`lead:${m.leadId}`)
      if (!raw) continue
      const lead = JSON.parse(raw) as {
        name?: string; phone?: string; email?: string; kind?: string; receivedAt?: string
      }
      details.push(
        `${escapeHtml(lead.name ?? 'Unknown')} — ${escapeHtml(lead.phone ?? lead.email ?? 'no contact')}` +
          ` (${escapeHtml(lead.kind ?? 'enquiry')}, ${escapeHtml(lead.receivedAt?.slice(0, 16) ?? '')})`,
      )
    } catch {
      // A lead that cannot be read is still worth counting.
    }
  }

  const res = await env.DB.prepare(
    `SELECT email FROM users
      WHERE status = 'active' AND role IN ('manager', 'super-admin') AND email IS NOT NULL`,
  ).all<{ email: string }>()
  const recipients = res.results ?? []

  let delivered = false
  for (const u of recipients) {
    const r = await sendEmail(env, {
      to: u.email,
      subject: `PullUp: ${markers.length} website enquir${markers.length === 1 ? 'y' : 'ies'} nobody was told about`,
      html: `<div style="font-family:system-ui,sans-serif;color:#0B1020">
        <h2 style="font:700 18px system-ui;margin:0 0 6px">Enquiries that did not reach anyone</h2>
        <p style="font:14px/1.6 system-ui;color:#5A6070;margin:0 0 12px">
          These were saved by the website but the notification failed at the time.
          They are real people who filled in the contact form and have heard nothing.
        </p>
        <ul style="font:14px/1.7 system-ui;padding-left:18px;margin:0">
          ${details.map(d => `<li>${d}</li>`).join('')}
        </ul>
      </div>`,
    }).catch(() => ({ ok: false }))
    if (r.ok) delivered = true
  }

  if (delivered) {
    await env.KV.put(SWEPT_KEY, String(Date.now()), { expirationTtl: 60 * 60 * 24 }).catch(() => undefined)
    // Cleared only once someone has actually been told, so a failed alert is
    // retried rather than the evidence being thrown away.
    for (const m of markers) {
      await env.SITE_KV.delete(m.key).catch(() => undefined)
    }
  } else {
    console.error(
      `LEAD SWEEP FOUND ${markers.length} UNREAD ENQUIR${markers.length === 1 ? 'Y' : 'IES'} AND COULD TELL NOBODY. ` +
        'Both the website notification and this alert have now failed.',
    )
  }

  return { found: markers.length, alerted: delivered }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
