import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import jwksRsa from 'jwks-rsa'
import type { Role } from '@pullup/shared'
import { env } from '../config/env.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

const issuer = `https://cognito-idp.${env.COGNITO_REGION}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`

const jwksClient = jwksRsa({
  jwksUri: `${issuer}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
})

export interface AuthUser {
  sub: string
  email?: string
  groups: string[]
  role: Role
  tokenUse: 'id' | 'access'
  branchId?: string
  managerId?: string
  riderId?: string
  status?: 'active' | 'inactive'
  name?: string
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

function resolveRole(groups: string[]): Role {
  if (groups.includes('super-admin')) return 'super-admin'
  if (groups.includes('manager')) return 'manager'
  return 'rider'
}

/**
 * Verify a Cognito JWT. Silent-pass when no Authorization header is present so
 * downstream `requireAuth` middleware can produce a proper 401. Rejects when a
 * token is provided but invalid — never let bogus tokens slip through as
 * "anonymous".
 */
export async function verifyCognitoToken(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers['authorization']
  if (!auth) return next()

  const token = auth.replace(/^Bearer\s+/i, '')
  try {
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded || typeof decoded === 'string' || !decoded.header?.kid) {
      return next(unauthorized('malformed token'))
    }

    const key = await jwksClient.getSigningKey(decoded.header.kid)
    const publicKey = key.getPublicKey()

    const verified = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer,
    }) as jwt.JwtPayload & {
      'cognito:groups'?: string[]
      email?: string
      token_use?: 'id' | 'access'
      client_id?: string
      aud?: string
    }

    const tokenUse = verified.token_use
    if (tokenUse !== 'id' && tokenUse !== 'access') {
      return next(unauthorized('unexpected token_use'))
    }

    // Access tokens carry client_id; ID tokens carry aud.
    const expectedClient = env.COGNITO_APP_CLIENT_ID
    if (tokenUse === 'access' && verified.client_id !== expectedClient) {
      return next(unauthorized('audience mismatch'))
    }
    if (tokenUse === 'id' && verified.aud !== expectedClient) {
      return next(unauthorized('audience mismatch'))
    }

    const groups = verified['cognito:groups'] ?? []
    req.user = {
      sub: verified.sub as string,
      email: verified.email,
      groups,
      role: resolveRole(groups),
      tokenUse,
    }
    return next()
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'jwt verify failed')
    return next(unauthorized('invalid or expired token'))
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized())
  if (req.user.status === 'inactive') return next(forbidden('account disabled'))
  next()
}

export function requireGroup(...groups: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized())
    if (!groups.some(g => req.user!.groups.includes(g))) return next(forbidden())
    next()
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized())
    if (!roles.includes(req.user.role)) return next(forbidden())
    next()
  }
}
