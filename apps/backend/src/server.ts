import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'
import { verifyCognitoToken } from './middleware/auth.js'
import { enrichUserFromDynamo } from './middleware/branchScope.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { authLimiter, globalLimiter } from './middleware/rateLimit.js'

import ordersRouter from './routes/orders.js'
import syncRouter from './routes/sync.js'
import trackerRouter from './routes/tracker.js'
import ridersRouter from './routes/riders.js'
import fleetRouter from './routes/fleet.js'
import partnersRouter from './routes/partners.js'
import financeRouter from './routes/finance.js'
import branchesRouter from './routes/branches.js'
import usersRouter from './routes/users.js'
import permissionsRouter from './routes/permissions.js'
import paramsRouter from './routes/params.js'
import zonesRouter from './routes/zones.js'
import physicsPricingRouter from './routes/physicsPricing.js'
import customersRouter from './routes/customers.js'
import analyticsRouter from './routes/analytics.js'
import pushRouter from './routes/push.js'

export function buildApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(
    cors({
      origin: env.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(pinoHttp({ logger, autoLogging: { ignore: req => req.url === '/health' } }))
  app.use(globalLimiter)

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'pullup-api', env: env.NODE_ENV }))

  // Auth pipeline
  app.use(verifyCognitoToken)
  app.use(enrichUserFromDynamo)

  // Public
  app.use('/api/tracker', trackerRouter)
  app.use('/api/push', pushRouter)
  app.use('/api/users/me', authLimiter)

  // Protected
  app.use('/api/orders', ordersRouter)
  app.use('/api/sync', syncRouter)
  app.use('/api/riders', ridersRouter)
  app.use('/api/fleet', fleetRouter)
  app.use('/api/partners', partnersRouter)
  app.use('/api/finance', financeRouter)
  app.use('/api/branches', branchesRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/permissions', permissionsRouter)
  app.use('/api/params', paramsRouter)
  app.use('/api/zones', zonesRouter)
  app.use('/api/physics-pricing', physicsPricingRouter)
  app.use('/api/customers', customersRouter)
  app.use('/api/analytics', analyticsRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

export const app = buildApp()
