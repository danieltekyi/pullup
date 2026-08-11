import type { Context, MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AppVariables, Env, AppUser } from '../env'
import { unauthorized, forbidden } from '../lib/errors'
import type { Role } from '@pullup/shared'

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>

// Cache the JWKS across invocations (Workers reuse module scope across warm requests).
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`), {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30_000,
    })
    jwksCache.set(teamDomain, jwks)
  }
  return jwks
}

/**
 * Verify the Cloudflare Access JWT that Cloudflare puts in the
 * `Cf-Access-Jwt-Assertion` header (or CF_Authorization cookie) on every
 * request that passed through an Access policy.
 *
 * For cross-origin requests (frontend on pulluprider.* → API on api.*),
 * Cloudflare does NOT inject the header, so we also read from the
 * CF_Authorization cookie which the browser sends with credentials: 'include'.
 *
 * Loads the DB user profile and populates c.get('user').
 * Silent-pass when no token — downstream `requireAuth` produces the 401.
 */
export function accessAuth(): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization') || c.req.header('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      // Try rider JWT
      try {
        const { verifyRiderToken } = await import('../routes/riderAuth')
        const riderPayload = await verifyRiderToken(c.env, authHeader)
        if (riderPayload) {
          // SECURITY (DEF-008): status was hard-coded 'active', so requireAuth's
          // inactive check could never fire and a deactivated rider kept access
          // for the full 30-day token life. Re-read the live status from D1.
          const live = await c.env.DB.prepare(
            `SELECT status FROM users WHERE id = ? LIMIT 1`,
          ).bind(riderPayload.sub).first<{ status: 'active' | 'inactive' }>()
          c.set('user', {
            sub: riderPayload.sub,
            email: riderPayload.email ?? '',
            id: riderPayload.sub,
            name: riderPayload.name ?? 'Rider',
            role: riderPayload.role as AppUser['role'],
            status: live?.status ?? 'inactive',
            branchId: riderPayload.branchId,
            riderId: riderPayload.riderId,
          })
          return next()
        }
      } catch { /* fall through */ }

      // Try partner JWT
      try {
        const { verifyPartnerToken } = await import('../routes/partnerAuth')
        const partnerPayload = await verifyPartnerToken(c.env, authHeader)
        if (partnerPayload) {
          // SECURITY (DEF-008): honour deactivation for partners too.
          const live = await c.env.DB.prepare(
            `SELECT active FROM partners WHERE id = ? LIMIT 1`,
          ).bind(partnerPayload.partnerId ?? partnerPayload.sub).first<{ active: number }>()
          c.set('user', {
            sub: partnerPayload.sub,
            email: partnerPayload.email ?? '',
            id: partnerPayload.sub,
            name: partnerPayload.name ?? 'Partner',
            role: 'partner' as AppUser['role'],
            status: live?.active ? 'active' : 'inactive',
            partnerId: partnerPayload.partnerId,
          })
          return next()
        }
      } catch { /* fall through to Access */ }
    }

    const token = extractToken(c)
    if (!token) return next()

    try {
      const { payload } = await jwtVerify(token, getJwks(c.env.CF_ACCESS_TEAM_DOMAIN), {
        issuer: `https://${c.env.CF_ACCESS_TEAM_DOMAIN}`,
      })
      // AUD may be a single string or an array. Match against any of the AUDs
      // we accept (comma-separated in env: admin, rider, api). This lets the
      // same Worker serve calls from any of the three subdomains.
      const acceptedAuds = c.env.CF_ACCESS_AUD.split(',').map(a => a.trim()).filter(Boolean)
      const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean)
      const audMatch = tokenAud.some(a => acceptedAuds.includes(String(a)))
      if (!audMatch) {
        console.warn('AUD mismatch — token AUD:', tokenAud, 'accepted:', acceptedAuds)
        return next()
      }
      const email = String(payload.email || '').toLowerCase()
      if (!email) return next()

      // Load app profile from D1 — creates on first sign-in as `rider`.
      const profile = await loadOrCreateProfile(c, email, String(payload.sub || email), String(payload.name || email))
      c.set('user', profile)
    } catch (err) {
      // Bad token → refuse silently; downstream will emit 401.
      console.warn('access jwt verify failed', (err as Error).message)
    }
    return next()
  }
}

function extractToken(c: AppContext): string | undefined {
  // 1. Cf-Access-Jwt-Assertion header — injected by Access for same-domain requests
  const header = c.req.header('Cf-Access-Jwt-Assertion') || c.req.header('cf-access-jwt-assertion')
  if (header) return header
  // 2. CF_Authorization cookie — sent by browser for cross-origin requests
  //    (frontend on pulluprider.* making calls to api.* with credentials: 'include')
  const cookie = c.req.header('cookie') || ''
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)
  return m?.[1]
}

async function loadOrCreateProfile(
  c: AppContext,
  email: string,
  sub: string,
  name: string,
): Promise<AppUser> {
  const row = await c.env.DB.prepare(
    `SELECT id, email, name, role, status, branch_id, manager_id, rider_id FROM users WHERE email = ? LIMIT 1`,
  )
    .bind(email)
    .first<{
      id: string
      email: string
      name: string
      role: Role
      status: 'active' | 'inactive'
      branch_id: string | null
      manager_id: string | null
      rider_id: string | null
    }>()

  // A client signing in through the Access-protected portal is identified by
  // the email Access verified. Map that to their partner record so the request
  // is scoped to their own orders (see getPartnerFilter). Without this a client
  // would authenticate successfully and then see nothing, or would need a
  // second sign-in to obtain a partner token.
  const partner = await c.env.DB.prepare(
    `SELECT id FROM partners WHERE email = ? AND active = 1 LIMIT 1`,
  )
    .bind(email)
    .first<{ id: string }>()

  if (row) {
    // Never demote a staff account just because the address also appears in the
    // partners table.
    const isStaff = row.role === 'super-admin' || row.role === 'manager'
    const role: Role = !isStaff && partner ? 'partner' : row.role
    return {
      sub,
      email,
      id: row.id,
      name: row.name,
      role,
      status: row.status,
      branchId: row.branch_id ?? undefined,
      managerId: row.manager_id ?? undefined,
      riderId: row.rider_id ?? undefined,
      partnerId: partner?.id,
    }
  }

  // Bootstrap: seed the first super-admin explicitly via BOOTSTRAP_ADMIN_EMAIL.
  // SECURITY (DEF-014): this previously granted super-admin to whoever signed in
  // while the users table was empty, so a restore-from-empty or failed migration
  // would hand the next visitor full control. Elevation is now opt-in.
  const bootstrapEmail = (c.env.BOOTSTRAP_ADMIN_EMAIL ?? '').toLowerCase().trim()
  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>()
  const isFirstUser = (totalRow?.c ?? 0) === 0
  const initialRole: Role = isFirstUser && bootstrapEmail && email === bootstrapEmail
    ? 'super-admin'
    : partner
      ? 'partner'
      : 'rider'

  const id = sub || `usr_${crypto.randomUUID()}`
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, role, status, branch_id) VALUES (?, ?, ?, ?, 'active', 'default')`,
  )
    .bind(id, email, name, initialRole)
    .run()
  return {
    sub,
    email,
    id,
    name,
    role: initialRole,
    status: 'active',
    branchId: 'default',
    partnerId: partner?.id,
  }
}

export function requireAuth(): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) throw unauthorized()
    if (user.status === 'inactive') throw forbidden('account disabled')
    return next()
  }
}

export function requireRole(
  ...roles: Role[]
): MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> {
  return async (c, next) => {
    const user = c.get('user')
    if (!user) throw unauthorized()
    if (!roles.includes(user.role)) throw forbidden()
    return next()
  }
}
