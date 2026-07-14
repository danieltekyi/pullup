import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'
import type { Permissions, Role } from '@pullup/shared'
import { DEFAULT_PERMISSIONS } from '@pullup/shared'

export async function getPermissionsForRole(role: Role): Promise<Permissions> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.permissions, Key: { role } }))
  const item = res.Item as { role: Role; permissions: Permissions } | undefined
  return item?.permissions ?? DEFAULT_PERMISSIONS[role]
}

export async function setPermissionsForRole(role: Role, permissions: Permissions): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLES.permissions,
      Item: { role, permissions, updatedAt: new Date().toISOString() },
    }),
  )
}
