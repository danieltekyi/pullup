import type { Context, MiddlewareHandler } from 'hono'
import type { AppVariables, Env, RateLimiter } from '../env'

type Ctx = Context<{ Bindings: Env; Variables: AppVariables }>

export function clientIp(c: Ctx): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

export type RateLimitBinding =
  | 'RL_PUBLIC'
  | 'RL_ESTIMATE'
  | 'RL_ORDER_CREATE'
  | 'RL_AUTH_REQUEST'
  | 'RL_AUTH_VERIFY'

export interface RateLimitOptions {
  /** Which binding to use — see `[[ratelimits]]` in wrangler.toml. */
  binding: RateLimitBinding
  /** Derive the identity being limited. Defaults to client IP. */
  key?: (c: Ctx) => string
}

/**
 * Request throttling backed by Cloudflare's native rate limiting (DEF-002).
 *
 * This deliberately does NOT use Workers KV. KV reads are edge-cached for up to
 * 60 seconds, so a KV counter cannot see its own recent writes — a burst sails
 * straight through while the counter still reads zero. That was observed in
 * production: 30 rapid requests, 30 allowed, 0 throttled. The native limiter is
 * strongly consistent within a colo and is the correct primitive here.
 *
 * Fails open when the binding is missing so a misconfigured environment
 * degrades to "unthrottled" rather than "entirely offline".
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler<{
  Bindings: Env
  Variables: AppVariables
}> {
  return async (c, next) => {
    const limiter = c.env[opts.binding] as RateLimiter | undefined
    if (!limiter?.limit) return next()

    const key = opts.key ? opts.key(c as Ctx) : clientIp(c as Ctx)

    try {
      const { success } = await limiter.limit({ key })
      if (!success) {
        console.warn({ binding: opts.binding, key }, 'rate limit exceeded')
        return c.json(
          { error: 'rate_limited', message: 'Too many requests. Please slow down.' },
          429,
          { 'Retry-After': '60' },
        )
      }
    } catch (err) {
      // Never let the limiter itself break the request path.
      console.warn('rate limiter unavailable', (err as Error).message)
    }

    return next()
  }
}

/* ------------------------------------------------------------------ */
/* One-time-code attempt lockout                                       */
/* ------------------------------------------------------------------ */

/**
 * Attempt counter for OTP verification (DEF-003).
 *
 * Correctness here does not rest on KV read freshness: every wrong guess writes
 * a new value, and once the ceiling is reached the caller deletes the stored
 * code outright. Even if a stale read briefly under-counts, destroying the code
 * is the control that actually matters. The native per-request limiter above
 * additionally caps how fast guesses can arrive.
 */
export async function registerFailedAttempt(
  env: Env,
  bucket: string,
  identity: string,
  max = 5,
): Promise<{ allowed: boolean; attempts: number }> {
  const key = `attempts:${bucket}:${identity}`
  try {
    const attempts = Number((await env.KV.get(key, { cacheTtl: 60 })) ?? 0) + 1
    await env.KV.put(key, String(attempts), { expirationTtl: 900 })
    return { allowed: attempts < max, attempts }
  } catch {
    return { allowed: true, attempts: 0 }
  }
}

export async function attemptsExceeded(
  env: Env,
  bucket: string,
  identity: string,
  max = 5,
): Promise<boolean> {
  try {
    const raw = await env.KV.get(`attempts:${bucket}:${identity}`, { cacheTtl: 60 })
    return Number(raw ?? 0) >= max
  } catch {
    return false
  }
}

export async function clearAttempts(env: Env, bucket: string, identity: string): Promise<void> {
  try {
    await env.KV.delete(`attempts:${bucket}:${identity}`)
  } catch {
    /* non-fatal */
  }
}
