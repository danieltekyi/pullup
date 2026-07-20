import type { Env } from '../../env'

/**
 * Send transactional email.
 *
 * Priority:
 *  1. Resend API  (set RESEND_API_KEY secret via `wrangler secret put RESEND_API_KEY`)
 *  2. MailChannels (legacy free path — deprecated by MC, may not work)
 *
 * Sign up free at https://resend.com — 3 000 emails/month free.
 * Add your sending domain and set the API key as a Worker secret.
 */
export async function sendEmail(
  env: Env,
  opts: { to: string; subject: string; html: string; from?: string; fromName?: string },
): Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }> {
  const from = opts.from || env.FROM_EMAIL || 'no-reply@pullup.aegisassetllc.com'
  const fromName = opts.fromName || 'PullUp'
  const fromHeader = `${fromName} <${from}>`

  // --- 1. Resend (preferred) ---
  if ((env as any).RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(env as any).RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromHeader,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      const body = await res.json<any>()
      if (!res.ok) console.warn('Resend error', body)
      return { ok: res.ok, status: res.status, error: body?.message }
    } catch (err) {
      console.warn('Resend fetch failed', (err as Error).message)
    }
  }

  // --- 2. MailChannels fallback ---
  try {
    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: opts.to }] }],
        from: { email: from, name: fromName },
        subject: opts.subject,
        content: [{ type: 'text/html', value: opts.html }],
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) console.warn('MailChannels status', res.status)
    return { ok: res.ok, status: res.status }
  } catch (err) {
    console.warn('MailChannels failed', (err as Error).message)
    return { ok: false, error: 'Email sending unavailable — set RESEND_API_KEY secret' }
  }
}

export function trackerEmailHtml(vars: { trackingUrl: string; orderId: string; customerName?: string; logoUrl?: string }): string {
  return `
<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f1f5f9;margin:0;padding:40px 20px;">
  <table cellspacing="0" cellpadding="0" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <tr><td style="padding:40px 40px 20px;text-align:center;">
      ${vars.logoUrl ? `<img src="${vars.logoUrl}" style="max-height:40px;margin-bottom:16px;" alt="logo" />` : ''}
      <h1 style="margin:0 0 8px;font-size:22px;color:#1e293b;">Your delivery is on the way</h1>
      <p style="margin:0 0 24px;color:#64748b;font-size:15px;">
        Hi ${vars.customerName ?? 'there'}, we're on the road with order <strong>${vars.orderId}</strong>.
      </p>
      <a href="${vars.trackingUrl}" style="display:inline-block;padding:14px 32px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;border-radius:10px;font-size:15px;">Track my order</a>
    </td></tr>
    <tr><td style="padding:20px 40px 40px;text-align:center;color:#94a3b8;font-size:12px;">
      Powered by PullUp Delivery
    </td></tr>
  </table>
</body></html>`
}
