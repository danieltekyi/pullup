import type { Env } from '../../env'

export async function sendSms(env: Env, to: string | string[], message: string): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!env.AT_USERNAME || !env.AT_API_KEY) return { ok: false, skipped: true }
  const recipients = Array.isArray(to) ? to.join(',') : to
  const params = new URLSearchParams({ username: env.AT_USERNAME, to: recipients, message })
  if (env.AT_SENDER_ID) params.append('from', env.AT_SENDER_ID)
  const url = env.AT_USERNAME === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging'
  const res = await fetch(url, {
    method: 'POST',
    headers: { apiKey: env.AT_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString(),
    signal: AbortSignal.timeout(10_000),
  })
  return { ok: res.ok }
}
