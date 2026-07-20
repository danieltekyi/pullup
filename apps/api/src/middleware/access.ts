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

  if (row) {
    return {
      sub,
      email,
      id: row.id,
      name: row.name,
      role: row.role,
      status: row.status,
      branchId: row.branch_id ?? undefined,
      managerId: row.manager_id ?? undefined,
      riderId: row.rider_id ?? undefined,
    }
  }

  // Bootstrap: first user to hit the system becomes super-admin (matches the
  // Access-only auth model — anyone reaching this point already passed Access
  // for one of our apps). Subsequent unknown users become riders and need
  // manager promotion.
  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first<{ c: number }>()
  const initialRole: Role = (totalRow?.c ?? 0) === 0 ? 'super-admin' : 'rider'

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
