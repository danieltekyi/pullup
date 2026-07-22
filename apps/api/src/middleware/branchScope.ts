import type { Context } from 'hono'
import type { AppVariables, Env } from '../env'

/**
 * Compute the effective branchId filter for a query.
 * Fails closed: unassigned users get '__none__' which never matches.
 */
export function getBranchFilter(c: Context<{ Bindings: Env; Variables: AppVariables }>): string {
  const user = c.get('user')
  if (!user) return '__none__'
  if (user.role === 'super-admin') {
    const q = c.req.query('branchId')
    return q || '__ALL__'
  }
  return user.branchId || '__none__'
}

export function getPartnerFilter(c: Context<{ Bindings: Env; Variables: AppVariables }>): string | undefined {
  const user = c.get('user')
  if (user?.role === 'partner') return user.partnerId || '__none__'
  return undefined
}

export function getRiderFilter(c: Context<{ Bindings: Env; Variables: AppVariables }>): string | undefined {
  const user = c.get('user')
  if (user?.role === 'rider') return user.riderId || '__none__'
  return undefined
}
