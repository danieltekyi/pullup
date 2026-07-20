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

app.use('*', accessAuth())

app.get('/health', c => c.json({ ok: true, service: 'pullup-api', env: c.env.CF_ACCESS_TEAM_DOMAIN }))

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
