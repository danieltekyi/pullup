import { Router } from 'express'
import { z } from 'zod'
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth, requireGroup } from '../middleware/auth.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import {
  findUserProfile,
  listUsers,
  softDeleteUser,
  upsertUserProfile,
} from '../data/usersRepo.js'
import { badRequest, conflict, notFound } from '../lib/errors.js'

const cognito = new CognitoIdentityProviderClient({ region: env.COGNITO_REGION })
const router = Router()

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await findUserProfile(req.user!.sub)
    if (!profile) {
      return res.json({
        sub: req.user!.sub,
        email: req.user!.email,
        role: req.user!.role,
        groups: req.user!.groups,
      })
    }
    res.json(profile)
  }),
)

router.get(
  '/',
  requireAuth,
  requireGroup('super-admin'),
  asyncHandler(async (req, res) => {
    const branchId = req.query.branchId as string | undefined
    res.json({ items: await listUsers(branchId) })
  }),
)

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(12),
  role: z.enum(['super-admin', 'manager', 'rider']),
  branchId: z.string().optional(),
  managerId: z.string().optional(),
})

router.post(
  '/',
  requireAuth,
  requireGroup('super-admin'),
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, branchId, managerId } = req.body as z.infer<typeof createSchema>
    let cognitoCreated = false
    try {
      const created = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: env.COGNITO_USER_POOL_ID,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: name },
          ],
          MessageAction: 'SUPPRESS',
        }),
      )
      const sub = created.User?.Attributes?.find(a => a.Name === 'sub')?.Value
      if (!sub) throw new Error('cognito did not return a sub')
      cognitoCreated = true

      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: env.COGNITO_USER_POOL_ID,
          Username: email,
          Password: password,
          Permanent: true,
        }),
      )
      await cognito.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: env.COGNITO_USER_POOL_ID,
          Username: email,
          GroupName: role,
        }),
      )
      const profile = await upsertUserProfile({
        id: sub,
        email,
        name,
        role,
        status: 'active',
        branchId,
        managerId,
        cognitoUsername: email,
        createdAt: new Date().toISOString(),
        createdBy: req.user!.sub,
        updatedAt: new Date().toISOString(),
      })
      res.status(201).json(profile)
    } catch (err) {
      if (cognitoCreated) {
        try {
          await cognito.send(
            new AdminDeleteUserCommand({ UserPoolId: env.COGNITO_USER_POOL_ID, Username: email }),
          )
        } catch (rbErr) {
          logger.warn({ rbErr }, 'rollback failed')
        }
      }
      const name = (err as { name?: string }).name
      if (name === 'UsernameExistsException') throw conflict('user with this email already exists')
      if (name === 'InvalidPasswordException') throw badRequest((err as Error).message)
      throw err
    }
  }),
)

router.put(
  '/:id',
  requireAuth,
  requireGroup('super-admin'),
  validateBody(
    z.object({
      branchId: z.string().optional(),
      managerId: z.string().optional(),
      riderId: z.string().optional(),
      status: z.enum(['active', 'inactive']).optional(),
      name: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const existing = await findUserProfile(req.params.id)
    if (!existing) throw notFound('user not found')
    const updated = { ...existing, ...req.body, updatedAt: new Date().toISOString() }
    if (req.body.status === 'inactive' && existing.status !== 'inactive') {
      try {
        await cognito.send(
          new AdminDisableUserCommand({
            UserPoolId: env.COGNITO_USER_POOL_ID,
            Username: existing.cognitoUsername,
          }),
        )
      } catch (err) {
        logger.warn({ err }, 'cognito disable failed')
      }
    }
    if (req.body.status === 'active' && existing.status === 'inactive') {
      try {
        await cognito.send(
          new AdminEnableUserCommand({
            UserPoolId: env.COGNITO_USER_POOL_ID,
            Username: existing.cognitoUsername,
          }),
        )
      } catch (err) {
        logger.warn({ err }, 'cognito enable failed')
      }
    }
    await upsertUserProfile(updated)
    res.json(updated)
  }),
)

router.delete(
  '/:id',
  requireAuth,
  requireGroup('super-admin'),
  asyncHandler(async (req, res) => {
    const existing = await findUserProfile(req.params.id)
    if (!existing) throw notFound('user not found')
    try {
      await cognito.send(
        new AdminDisableUserCommand({
          UserPoolId: env.COGNITO_USER_POOL_ID,
          Username: existing.cognitoUsername,
        }),
      )
    } catch (err) {
      logger.warn({ err }, 'cognito disable during delete failed')
    }
    await softDeleteUser(req.params.id)
    res.json({ ok: true })
  }),
)

export default router
