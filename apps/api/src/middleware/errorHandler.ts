import type { ErrorHandler, NotFoundHandler } from 'hono'
import type { AppVariables, Env } from '../env'
import { HttpError } from '../lib/errors'

export const errorHandler: ErrorHandler<{ Bindings: Env; Variables: AppVariables }> = (err, c) => {
  if (err instanceof HttpError) {
    return c.json(
      { error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      err.statusCode as never,
    )
  }
  console.error('unhandled', err.message, err.stack)
  return c.json({ error: 'server_error', message: err.message || 'Internal Server Error' }, 500)
}

export const notFoundHandler: NotFoundHandler<{ Bindings: Env; Variables: AppVariables }> = c =>
  c.json({ error: 'not_found', message: `Route not found: ${c.req.path}` }, 404)
