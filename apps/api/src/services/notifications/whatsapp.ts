import type { Env } from '../../env'

export async function sendWhatsApp(env: Env, to: string, body: string): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) return { ok: false, skipped: true }
  const params = new URLSearchParams({
    From: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`,
    To: `whatsapp:${to}`,
    Body: body,
  })
  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(10_000),
  })
  return { ok: res.ok }
}
