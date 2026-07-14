import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'

/**
 * WhatsApp via Twilio. Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM.
 * `to` must be a full E.164 number without the `whatsapp:` prefix.
 */
export async function sendWhatsApp(to: string, body: string): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    logger.warn({ to }, 'Twilio credentials missing — WhatsApp skipped')
    return { ok: false, skipped: true }
  }

  const params = new URLSearchParams({
    From: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`,
    To: `whatsapp:${to}`,
    Body: body,
  })

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    const body = await res.text()
    logger.error({ status: res.status, body }, 'Twilio WhatsApp send failed')
    return { ok: false }
  }
  return { ok: true }
}
