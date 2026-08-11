import type { Context, MiddlewareHandler } from 'hono'
import type { AppVariables, Env } from '../env'

type Ctx = Context<{ Bindings: Env; Variables: AppVariables }>

export interface RateLimitOptions {
  /** Requests permitted inside the window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
  /** Namespace so different routes keep separate counters. */
  bucket: string
  /** Derive the identity being limited. Defaults to client IP. */
  key?: (c: Ctx) => string
}

export function clientIp(c: Ctx): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/**
 * Fixed-window rate limiter backed by Workers KV (DEF-002).
 *
 * KV is eventually consistent, so under a burst across many colos the effective
 * ceiling can exceed `limit`. That is an acceptable trade for abuse control:
 * it still turns "unlimited" into "bounded", which is what stops enumeration
 * and credential brute force. Auth lockouts additionally track attempts
 * per-identity so correctness there does not rely on this counter alone.
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler<{
  Bindings: Env
  Variables: AppVariables
}> {
  return async (c, next) => {
    const id = opts.key ? opts.key(c as Ctx) : clientIp(c as Ctx)
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds)
    const key = `rl:${opts.bucket}:${id}:${window}`

    let count = 0
    try {
      count = Number((await c.env.KV.get(key)) ?? 0)
    } catch {
      // KV unavailable — fail open so a cache outage cannot take the API down.
      return next()
    }

    if (count >= opts.limit) {
      const retryAfter = opts.windowSeconds - (Math.floor(Date.now() / 1000) % opts.windowSeconds)
      console.warn({ bucket: opts.bucket, id, count }, 'rate limit exceeded')
      return c.json(
        { error: 'rate_limited', message: 'Too many requests. Please slow down.' },
        429,
        { 'Retry-After': String(retryAfter) },
      )
    }

    c.executionCtx.waitUntil(
      c.env.KV.put(key, String(count + 1), { expirationTtl: Math.max(60, opts.windowSeconds * 2) })
        .catch(() => undefined),
    )

    return next()
  }
}

/**
 * Per-identity attempt counter for one-time-code verification (DEF-003).
 * Returns false once the ceiling is hit so the caller can invalidate the code.
 */
export async function registerFailedAttempt(
  env: Env,
  bucket: string,
  identity: string,
  max = 5,
): Promise<{ allowed: boolean; attempts: number }> {
  const key = `attempts:${bucket}:${identity}`
  let attempts = 0
  try {
    attempts = Number((await env.KV.get(key)) ?? 0) + 1
    await env.KV.put(key, String(attempts), { expirationTtl: 900 })
  } catch {
    return { allowed: true, attempts: 0 }
  }
  return { allowed: attempts < max, attempts }
}

export async function attemptsExceeded(
  env: Env,
  bucket: string,
  identity: string,
  max = 5,
): Promise<boolean> {
  try {
    return Number((await env.KV.get(`attempts:${bucket}:${identity}`)) ?? 0) >= max
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
