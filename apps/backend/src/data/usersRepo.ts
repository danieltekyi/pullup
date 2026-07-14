import { GetCommand, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'

export interface UserProfile {
  id: string
  email: string
  name: string
  role: 'super-admin' | 'manager' | 'rider'
  status: 'active' | 'inactive'
  branchId?: string
  managerId?: string
  riderId?: string
  cognitoUsername: string
  createdAt: string
  createdBy?: string
  updatedAt: string
  deletedAt?: string
}

export async function findUserProfile(id: string): Promise<UserProfile | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { id } }))
  const u = res.Item as UserProfile | undefined
  if (u?.deletedAt) return undefined
  return u
}

export async function findUserByEmail(email: string): Promise<UserProfile | undefined> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.users,
      IndexName: 'gsi_email',
      KeyConditionExpression: 'email = :e',
      ExpressionAttributeValues: { ':e': email.toLowerCase() },
      Limit: 1,
    }),
  )
  return res.Items?.[0] as UserProfile | undefined
}

export async function listUsers(branchId?: string): Promise<UserProfile[]> {
  if (branchId) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLES.users,
        IndexName: 'gsi_branch',
        KeyConditionExpression: 'branchId = :b',
        ExpressionAttributeValues: { ':b': branchId },
      }),
    )
    return ((res.Items ?? []) as UserProfile[]).filter(u => !u.deletedAt)
  }
  // Rare full scan for super-admin overview.
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb')
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.users }))
  return ((res.Items ?? []) as UserProfile[]).filter(u => !u.deletedAt)
}

export async function upsertUserProfile(p: UserProfile): Promise<UserProfile> {
  const updated: UserProfile = { ...p, email: p.email.toLowerCase(), updatedAt: new Date().toISOString() }
  await ddb.send(new PutCommand({ TableName: TABLES.users, Item: updated }))
  return updated
}

export async function softDeleteUser(id: string): Promise<void> {
  const existing = await findUserProfile(id)
  if (!existing) return
  await ddb.send(
    new PutCommand({
      TableName: TABLES.users,
      Item: { ...existing, status: 'inactive', deletedAt: new Date().toISOString() },
    }),
  )
}

export async function hardDeleteUser(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.users, Key: { id } }))
}
