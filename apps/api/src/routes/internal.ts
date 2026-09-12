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
  /** Also send the enquirer an acknowledgement. */
  acknowledge: z.boolean().optional(),
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

  /*
    Acknowledge the enquirer.

    Sent after the internal notification and never allowed to fail the request:
    telling the business is what must not be lost, and an acknowledgement that
    did not arrive is a disappointment rather than a lost lead.

    Says only what is already public. No price, no commitment, nothing that
    commits PullUp to terms before a person has read the enquiry.
  */
  if (lead.acknowledge && lead.email) {
    const isRider = lead.kind === 'rider'
    const ack = await sendEmail(c.env, {
      to: lead.email,
      subject: isRider ? 'We have your application — PullUp' : 'We have your enquiry — PullUp',
      html: `<div style="font-family:system-ui,sans-serif;color:#0B1020;max-width:520px">
        <h2 style="font:700 19px system-ui;margin:0 0 10px">Thanks, ${escapeHtml(lead.name.split(' ')[0])}.</h2>
        <p style="font:15px/1.65 system-ui;margin:0 0 14px">
          ${isRider
            ? 'Your application is with us. We read every one properly rather than filtering on keywords, and we will call you on the number you gave us within a week.'
            : 'Your enquiry is with the dispatch desk. Someone reads every one, and we will come back to you with a real number — usually the same working day.'}
        </p>
        <p style="font:15px/1.65 system-ui;margin:0 0 14px">
          If it is urgent, don't wait on this: call or WhatsApp
          <a href="https://wa.me/233544736481" style="color:#C2410C">+233 54 473 6481</a>.
        </p>
        <p style="font:13px/1.6 system-ui;color:#5A6070;margin:20px 0 0;border-top:1px solid #E6E8EC;padding-top:14px">
          PullUp is operated by SwiftDrop LTD, Accra.<br>
          You are getting this because you contacted us at pullup.aegisassetllc.com. We do not add enquirers to a mailing list.
        </p>
      </div>`,
    }).catch(() => ({ ok: false }))

    if (!ack.ok) console.warn('lead acknowledgement not delivered to', lead.email)
  }

  return c.json({ ok: true })
})

export default app
