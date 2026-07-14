import { app } from './server.js'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'

const port = env.PORT
app.listen(port, () => {
  logger.info({ port, env: env.NODE_ENV }, `PullUp API listening on ${port}`)
})
