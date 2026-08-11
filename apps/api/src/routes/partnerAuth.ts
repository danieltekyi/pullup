import { Hono } from 'hono'
import { z } from 'zod'
import { SignJWT, jwtVerify } from 'jose'
import type { AppVariables, Env } from '../env'
import { badRequest } from '../lib/errors'
import { sendEmail } from '../services/notifications/email'
import { rateLimit, attemptsExceeded, registerFailedAttempt, clearAttempts } from '../middleware/rateLimit'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

// SECURITY (DEF-002)
app.use('/request', rateLimit({ bucket: 'partner-otp-request', limit: 5, windowSeconds: 300 }))
app.use('/verify', rateLimit({ bucket: 'partner-otp-verify', limit: 10, windowSeconds: 300 }))

// SECURITY (DEF-013): dedicated secret, with fallback for existing deployments.
function partnerJwtKey(env: Env) {
  const secret = env.PARTNER_SESSION_SECRET || env.TRACKER_LINK_SECRET
  return new TextEncoder().encode(secret + ':partner-session')
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

app.post('/request', async c => {
  const { identifier } = z.object({ identifier: z.string().min(4).max(120) }).parse(await c.req.json())

  const partner = await c.env.DB.prepare(
    `SELECT id, email, name, active FROM partners WHERE email = ? AND active = 1 LIMIT 1`
  ).bind(identifier.trim().toLowerCase()).first<{ id: string; email: string; name: string; active: number }>()

  if (!partner) {
    return c.json({ ok: true, message: 'If your account exists, a code has been sent.' })
  }

  const code = generateCode()
  await c.env.KV.put(
    `partner-code:${partner.id}`,
    JSON.stringify({ code, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), partnerId: partner.id }),
    { expirationTtl: 600 },
  )

  const sent = await sendEmail(c.env, {
    to: partner.email,
    subject: 'Your PullUp Partner sign-in code',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;text-align:center">
      <h2 style="color:#7c3aed">PullUp Partner Portal</h2>
      <p>Hi <strong>${partner.name}</strong>, your sign-in code is:</p>
      <p style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#1e1b4b">${code}</p>
      <p style="color:#64748b;font-size:14px">Valid for 10 minutes. Do not share this code.</p>
    </div>`,
  })

  const isDev = !sent.ok
  void isDev
  // SECURITY (DEF-004): never return the code over the API.
  return c.json({
    ok: true,
    message: 'If your account exists, a code has been sent.',
  })
})

app.post('/verify', async c => {
  const { identifier, code } = z.object({ identifier: z.string().min(4), code: z.string().length(6) }).parse(await c.req.json())

  const partner = await c.env.DB.prepare(
    `SELECT id, email, name, active FROM partners WHERE email = ? AND active = 1 LIMIT 1`
  ).bind(identifier.trim().toLowerCase()).first<{ id: string; email: string; name: string; active: number }>()

  if (!partner) throw badRequest('Invalid code or account not found')

  const stored = await c.env.KV.get(`partner-code:${partner.id}`, 'json') as { code: string; expiresAt: string } | null
  if (!stored) throw badRequest('Code expired — please request a new one')

  // SECURITY (DEF-003): lock the code after 5 wrong guesses.
  if (await attemptsExceeded(c.env, 'partner-otp', partner.id)) {
    await c.env.KV.delete(`partner-code:${partner.id}`)
    throw badRequest('Too many incorrect attempts — please request a new code')
  }

  if (stored.code !== code) {
    const { allowed } = await registerFailedAttempt(c.env, 'partner-otp', partner.id)
    if (!allowed) await c.env.KV.delete(`partner-code:${partner.id}`)
    throw badRequest('Invalid code')
  }
  if (new Date(stored.expiresAt) < new Date()) throw badRequest('Code expired — please request a new one')

  await c.env.KV.delete(`partner-code:${partner.id}`)
  await clearAttempts(c.env, 'partner-otp', partner.id)

  const jwt = await new SignJWT({
    sub: partner.id,
    email: partner.email,
    role: 'partner',
    partnerId: partner.id,
    name: partner.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(partnerJwtKey(c.env))

  return c.json({ ok: true, token: jwt, partner: { id: partner.id, name: partner.name, email: partner.email } })
})

export async function verifyPartnerToken(env: Env, authHeader?: string): Promise<{ sub: string; email?: string; role: string; partnerId?: string; name?: string } | null> {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  try {
    const { payload } = await jwtVerify(token, partnerJwtKey(env), { algorithms: ['HS256'] })
    return payload as { sub: string; email?: string; role: string; partnerId?: string; name?: string }
  } catch {
    return null
  }
}

export default app
