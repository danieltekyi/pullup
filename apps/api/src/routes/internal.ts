import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { badRequest, forbidden } from '../lib/errors'
import { sendEmail } from '../services/notifications/email'

/**
 * Service-to-service endpoints. Not for browsers, not for users.
 *
 * The marketing site is a separate Cloudflare Pages project and cannot see this
 * Worker's secrets. The obvious fix — put a second copy of the Resend key on
 * Pages — means two credentials to rotate, two sender configurations to keep
 * verified, and two places to get wrong. It was already wrong in both: this
 * Worker signed as an unverified subdomain, and the site signed as a domain
 * nobody had registered.
 *
 * So the site relays through here instead. One service holds the email
 * credential, one verified sender, one thing to rotate.
 *
 * The endpoint is deliberately narrow. It takes named fields and renders them
 * into a fixed template addressed to NOTIFY_EMAIL — the caller cannot choose a
 * recipient, a subject or a body. Even with the shared secret in hand, the most
 * an attacker could do is send PullUp's own enquiry format to PullUp's own
 * inbox. That is a nuisance, not a breach, and it is why this is not a general
 * "send an email" route.
 */

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

/**
 * Compares in constant time.
 *
 * A plain === on a secret leaks its length and prefix through timing. The cost
 * of doing this properly is a few lines.
 *
 * Exported so it can be tested directly — this is the only thing standing
 * between the internal endpoints and the open internet.
 */
export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Escapes text that came from a public web form before it enters HTML. */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function assertInternalCaller(c: { env: Env; req: { header: (k: string) => string | undefined } }) {
  const expected = c.env.INTERNAL_API_KEY
  // Refuses rather than falls open. An unconfigured shared secret must not mean
  // "anyone may call this".
  if (!expected) throw forbidden('internal endpoints are not configured')
  const given = c.req.header('x-internal-key')
  if (!given || !secretsMatch(given, expected)) throw forbidden('bad internal key')
}

const leadSchema = z.object({
  kind: z.enum(['business', 'rider', 'other']),
  name: z.string().min(1).max(120),
  email: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  business: z.string().max(160).optional(),
  volume: z.string().max(60).optional(),
  zone: z.string().max(80).optional(),
  bike: z.string().max(40).optional(),
  message: z.string().max(2000).optional(),
  receivedAt: z.string().max(40).optional(),
})

app.post('/lead-notify', async c => {
  assertInternalCaller(c)

  const parsed = leadSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) throw badRequest('invalid lead', parsed.error.flatten())
  const lead = parsed.data

  const to = c.env.NOTIFY_EMAIL
  if (!to) {
    console.error('LEAD RELAY RECEIVED A LEAD BUT NOTIFY_EMAIL IS UNSET — nobody was told.')
    return c.json({ ok: false, reason: 'no recipient configured' }, 503)
  }

  const rows = (
    [
      ['Name', lead.name],
      ['Business', lead.business],
      ['Email', lead.email],
      ['Phone', lead.phone],
      ['Monthly volume', lead.volume],
      ['Zone', lead.zone],
      ['Bike', lead.bike],
    ] as Array<[string, string | undefined]>
  )
    .filter(([, v]) => Boolean(v))
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#5A6070">${k}</td><td style="padding:6px 0"><strong>${escapeHtml(v!)}</strong></td></tr>`,
    )
    .join('')

  const body = lead.message
    ? `<p style="margin:16px 0 0;white-space:pre-wrap">${escapeHtml(lead.message)}</p>`
    : ''

  const result = await sendEmail(c.env, {
    to,
    subject: `New ${lead.kind} enquiry — ${lead.name}`,
    html: `<div style="font-family:system-ui,sans-serif;color:#0B1020">
      <h2 style="color:#FF5A1F;margin:0 0 4px">New ${lead.kind} enquiry</h2>
      <p style="margin:0 0 12px;color:#5A6070">From the PullUp website${lead.receivedAt ? ` at ${escapeHtml(lead.receivedAt)}` : ''}</p>
      <table style="border-collapse:collapse;font-size:14px">${rows}</table>
      ${body}
    </div>`,
  })

  if (!result.ok) {
    console.error('LEAD RELAY COULD NOT SEND —', result.error ?? result.status ?? 'unknown')
    return c.json({ ok: false, reason: 'send failed' }, 502)
  }

  return c.json({ ok: true })
})

export default app
