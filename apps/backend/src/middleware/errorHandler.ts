import type { ErrorRequestHandler } from 'express'
import { HttpError } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, err.message)
    }
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
  }

  logger.error({ err, path: req.path }, 'unhandled error')
  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : String(err.message || err)
  res.status(500).json({ error: 'server_error', message })
}

export const notFoundHandler = (_req: import('express').Request, res: import('express').Response) => {
  res.status(404).json({ error: 'not_found', message: 'Route not found' })
}
