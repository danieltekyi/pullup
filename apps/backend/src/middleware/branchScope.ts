import type { NextFunction, Request, Response } from 'express'
import { findUserProfile } from '../data/usersRepo.js'
import { logger } from '../lib/logger.js'

/**
 * Enrich req.user with the DynamoDB profile (branchId, managerId, riderId, status).
 * Safe when unauthenticated: does nothing.
 */
export async function enrichUserFromDynamo(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.sub) return next()
  try {
    const profile = await findUserProfile(req.user.sub)
    if (profile) {
      req.user.branchId = profile.branchId
      req.user.managerId = profile.managerId
      req.user.riderId = profile.riderId
      req.user.status = profile.status
      req.user.name = profile.name
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, sub: req.user.sub }, 'enrichUser failed')
  }
  next()
}

export function requireBranchScope(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next()
  if (req.user.role === 'super-admin') return next()
  if (!req.user.branchId) {
    return next(new Error('user has no branch assignment'))
  }
  next()
}

/**
 * Compute the effective branchId filter for a query.
 *
 * - super-admin: honours req.query.branchId (or returns undefined = all branches)
 * - manager/rider: locked to their own branchId
 * - falls back to a sentinel that matches nothing, so an unassigned user cannot
 *   accidentally list every branch.
 */
export function getBranchFilter(req: Request): string | undefined {
  const user = req.user
  if (!user) return '__none__'
  if (user.role === 'super-admin') {
    return (req.query.branchId as string | undefined) || undefined
  }
  return user.branchId || '__none__'
}

export function getRiderFilter(req: Request): string | undefined {
  if (req.user?.role === 'rider') return req.user.riderId || '__none__'
  return undefined
}
