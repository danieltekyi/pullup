import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { logger as honoLogger } from 'hono/logger'
import type { AppVariables, Env } from './env'
import { accessAuth } from './middleware/access'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import ordersRouter from './routes/orders'
import syncRouter from './routes/sync'
import trackerRouter from './routes/tracker'
import ridersRouter from './routes/riders'
import riderAuthRouter from './routes/riderAuth'
import riderLocationRouter from './routes/riderLocation'
import partnerAuthRouter from './routes/partnerAuth'
import publicOrdersRouter from './routes/publicOrders'
import resourcesRouter from './routes/resources'
import adminRouter, { scheduledPartnerFetch } from './routes/admin'
import { rateLimit } from './middleware/rateLimit'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

app.use('*', honoLogger())
app.use('*', secureHeaders())
app.use('*', async (c, next) => {
  const origins = c.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  const corsMw = cors({
    origin: (origin, _c) => {
      // Non-browser callers (curl, server-to-server) send no Origin header.
      if (!origin) return '*'
      if (origins.includes(origin) || origin.endsWith('.cloudflareaccess.com')) return origin
      // Explicit deny. Previously this returned origins[0], which the browser
      // rejects anyway but makes the logs read like a misconfiguration rather
      // than a refusal.
      return null
    },
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'Cf-Access-Jwt-Assertion', 'Cookie'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  })
  return corsMw(c, next)
})

// Returns public config (Maps key) — safe because Maps key is restricted by referrer
app.get('/api/public/config', c => {
  return c.json({
    mapsApiKey: c.env.GOOGLE_MAPS_API_KEY ?? null,
    currency: 'GHS',
  })
})

app.use('*', accessAuth())

app.get('/health', c => c.json({ ok: true, service: 'pullup-api', env: c.env.CF_ACCESS_TEAM_DOMAIN }))

// SECURITY (DEF-012): the auth debug endpoint disclosed the accepted Access AUD
// values and token presence. Restricted to signed-in super-admins.
app.get('/api/auth/debug', c => {
  const u = c.get('user')
  if (!u || u.role !== 'super-admin') return c.json({ error: 'not_found' }, 404)
  const cfJwt = c.req.header('Cf-Access-Jwt-Assertion')
  const cookie = c.req.header('cookie') || ''
  return c.json({
    user: { id: u.id, email: u.email, role: u.role, name: u.name },
    authenticated: true,
    headers: {
      hasCfJwt: !!cfJwt,
      hasCookie: cookie.includes('CF_Authorization='),
      hasBearer: (c.req.header('Authorization') || '').startsWith('Bearer '),
    },
  })
})

// SECURITY (DEF-002): throttle the public surface. Tracker validate is the
// endpoint that previously allowed unbounded customer-record probing.
app.use('/api/tracker/validate', rateLimit({ binding: 'RL_PUBLIC' }))
app.use('/api/tracker/proxy', rateLimit({ binding: 'RL_PUBLIC' }))
// Estimate calls the paid Google Distance Matrix API — cap it hard (DEF-006).
app.use('/api/public/orders/estimate', rateLimit({ binding: 'RL_ESTIMATE' }))
app.use('/api/public/orders', rateLimit({ binding: 'RL_ORDER_CREATE' }))

// Public endpoints — no Access needed
app.route('/api/rider-auth', riderAuthRouter)
app.route('/api/rider-location', riderLocationRouter)
app.route('/api/partner-auth', partnerAuthRouter)
app.route('/api/public', publicOrdersRouter)

app.route('/api/orders', ordersRouter)
app.route('/api/sync', syncRouter)
app.route('/api/tracker', trackerRouter)
app.route('/api/riders', ridersRouter)
app.route('/api', resourcesRouter)
app.route('/api', adminRouter)

app.notFound(notFoundHandler)
app.onError(errorHandler)

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledPartnerFetch(env).then(() => undefined).catch(err => console.error('partner fetch cron failed', err)))
  },
}
