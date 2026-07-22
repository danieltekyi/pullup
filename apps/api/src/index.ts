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
import publicOrdersRouter from './routes/publicOrders'
import resourcesRouter from './routes/resources'
import adminRouter, { scheduledPartnerFetch } from './routes/admin'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

app.use('*', honoLogger())
app.use('*', secureHeaders())
app.use('*', async (c, next) => {
  const origins = c.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  const corsMw = cors({
    origin: (origin, _c) => {
      // Allow requests from our three Pages subdomains AND
      // from aegis-dashboard.cloudflareaccess.com (for Access redirects)
      if (!origin) return '*'
      if (origins.includes(origin) || origin.endsWith('.cloudflareaccess.com')) return origin
      return origins[0] // fallback to first allowed origin
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

// Auth debug — shows what the Worker sees (token presence, user object).
// Visit pulluprider.aegisassetllc.com/api/auth/debug to diagnose login issues.
app.get('/api/auth/debug', c => {
  const u = c.get('user')
  const cfJwt = c.req.header('Cf-Access-Jwt-Assertion')
  const cookie = c.req.header('cookie') || ''
  const hasCookie = cookie.includes('CF_Authorization=')
  const hasBearer = (c.req.header('Authorization') || '').startsWith('Bearer ')
  return c.json({
    user: u ? { id: u.id, email: u.email, role: u.role, name: u.name } : null,
    authenticated: !!u,
    headers: { hasCfJwt: !!cfJwt, hasCookie, hasBearer },
    acceptedAuds: c.env.CF_ACCESS_AUD.split(',').map(a => a.trim()),
  })
})

// Public endpoints — no Access needed
app.route('/api/rider-auth', riderAuthRouter)
app.route('/api/rider-location', riderLocationRouter)
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
