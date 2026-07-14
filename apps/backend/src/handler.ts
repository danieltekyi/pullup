import serverless from 'serverless-http'
import { app } from './server.js'

export const handler = serverless(app, {
  binary: ['image/*', 'application/pdf', 'application/octet-stream'],
})
