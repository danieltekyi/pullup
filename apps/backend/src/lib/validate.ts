import type { NextFunction, Request, Response } from 'express'
import type { AnyZodObject, ZodEffects } from 'zod'
import { badRequest } from './errors.js'

type Schema = AnyZodObject | ZodEffects<AnyZodObject>

/**
 * Wrap an async route handler so thrown errors flow to the error middleware.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Validate `req.body` against a Zod schema. On failure, throw a 400.
 */
export function validateBody<T extends Schema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(badRequest('validation failed', parsed.error.flatten()))
    }
    req.body = parsed.data
    next()
  }
}

/**
 * Validate `req.query` against a Zod schema.
 */
export function validateQuery<T extends Schema>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) {
      return next(badRequest('invalid query', parsed.error.flatten()))
    }
    // Casting because Express types query as ParsedQs.
    ;(req as unknown as { query: unknown }).query = parsed.data
    next()
  }
}
