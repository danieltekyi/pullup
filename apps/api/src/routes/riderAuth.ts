import { Hono } from 'hono'
import { z } from 'zod'
import { SignJWT, jwtVerify } from 'jose'
import type { AppVariables, Env } from '../env'
import { badRequest } from '../lib/errors'
import { findUserByPhone, findUserByEmail } from '../repos/riderAuth'
import { sendSms } from '../services/notifications/sms'
import { sendEmail } from '../services/notifications/email'
import { nowIso } from '../lib/ids'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

// Secret for signing rider session JWTs (reuses TRACKER_LINK_SECRET)
function riderJwtKey(env: Env) {
  return new TextEncoder().encode(env.TRACKER_LINK_SECRET + ':rider-session')
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * POST /api/rider-auth/request
 * Body: { identifier: string }  (phone number or email)
 * Finds the rider by phone/email, generates a 6-digit code, sends it via SMS or email.
 */
app.post('/request', async c => {
  const body = z.object({
    identifier: z.string().min(4).max(120),
  }).parse(await c.req.json())

  const identifier = body.identifier.trim().toLowerCase()

  // Look up rider by phone or email
  const rider = await findUserByPhone(c.env, identifier) ?? await findUserByEmail(c.env, identifier)

  // Always return success — don't leak which identifiers are registered
  if (!rider || rider.status === 'inactive') {
    return c.json({ ok: true, message: 'If your account exists, a code has been sent.' })
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

  // Store code in KV
  await c.env.KV.put(
    `rider-code:${rider.id}`,
    JSON.stringify({ code, expiresAt, riderId: rider.id, identifier }),
    { expirationTtl: 600 },
  )

  // Send via SMS if phone, email otherwise
  const isPhone = /^\+?[0-9]{7,15}$/.test(body.identifier.replace(/\s/g, ''))
  let sent = false

  if (isPhone) {
    const r = await sendSms(c.env, body.identifier, `Your PullUp code is: ${code}. Valid 10 minutes.`)
    sent = r.ok
  }

  if (!sent) {
    // Fallback to email
    const r = await sendEmail(c.env, {
      to: rider.email ?? identifier,
      subject: 'Your PullUp sign-in code',
      html: `<p style="font-family:sans-serif;font-size:24px;font-weight:bold;letter-spacing:8px;text-align:center">${code}</p><p style="font-family:sans-serif;font-size:14px;text-align:center;color:#64748b">Valid for 10 minutes. Use it to sign in to the PullUp rider app.</p>`,
    })
    sent = r.ok
  }

  console.info({ riderId: rider.id, codeSent: sent, via: isPhone ? 'sms' : 'email' }, 'rider auth code sent')

  // In dev / when email isn't configured: return code in response so you can test without email.
  // Remove this block (or guard with a DEV flag) before going to production.
  const isDev = !sent
  return c.json({
    ok: true,
    message: sent
      ? 'If your account exists, a code has been sent.'
      : 'Code generated but email delivery failed. Set RESEND_API_KEY secret.',
    ...(isDev ? { _devCode: code } : {}),
  })
})

/**
 * POST /api/rider-auth/verify
 * Body: { identifier: string, code: string }
 * Verifies the code and returns a session JWT.
 */
app.post('/verify', async c => {
  const body = z.object({
    identifier: z.string().min(4).max(120),
    code: z.string().length(6),
  }).parse(await c.req.json())

  const identifier = body.identifier.trim().toLowerCase()

  const rider = await findUserByPhone(c.env, identifier) ?? await findUserByEmail(c.env, identifier)
  if (!rider || rider.status === 'inactive') {
    throw badRequest('Invalid code or account not found')
  }

  const stored = await c.env.KV.get(`rider-code:${rider.id}`, 'json') as { code: string; expiresAt: string } | null
  if (!stored) throw badRequest('Code expired — please request a new one')
  if (stored.code !== body.code) throw badRequest('Invalid code')
  if (new Date(stored.expiresAt) < new Date()) throw badRequest('Code expired — please request a new one')

  // Delete the code so it can only be used once
  await c.env.KV.delete(`rider-code:${rider.id}`)

  // Sign a 30-day session JWT
  const jwt = await new SignJWT({
    sub: rider.id,
    email: rider.email,
    role: rider.role,
    riderId: rider.riderId,
    branchId: rider.branchId,
    name: rider.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(riderJwtKey(c.env))

  return c.json({ ok: true, token: jwt, rider: { id: rider.id, name: rider.name, role: rider.role, riderId: rider.riderId, branchId: rider.branchId } })
})

/**
 * Middleware that validates a rider session JWT from the Authorization header.
 * Used by the Worker to authenticate riders without Cloudflare Access.
 */
export async function verifyRiderToken(env: Env, authHeader?: string): Promise<{ sub: string; email?: string; role: string; riderId?: string; branchId?: string; name?: string } | null> {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  try {
    const { payload } = await jwtVerify(token, riderJwtKey(env), { algorithms: ['HS256'] })
    return payload as { sub: string; email?: string; role: string; riderId?: string; branchId?: string; name?: string }
  } catch {
    return null
  }
}

export default app
