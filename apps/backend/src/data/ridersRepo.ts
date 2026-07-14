import { GetCommand, PutCommand, QueryCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'
import type { Rider } from '@pullup/shared'

export async function listRiders(branchId?: string): Promise<Rider[]> {
  if (branchId) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLES.riders,
        IndexName: 'gsi_branch',
        KeyConditionExpression: 'branchId = :b',
        ExpressionAttributeValues: { ':b': branchId },
      }),
    )
    return ((res.Items ?? []) as Rider[]).filter(r => !r.deletedAt)
  }
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.riders }))
  return ((res.Items ?? []) as Rider[]).filter(r => !r.deletedAt)
}

export async function findRider(id: string): Promise<Rider | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.riders, Key: { id } }))
  const r = res.Item as Rider | undefined
  return r?.deletedAt ? undefined : r
}

export async function createRider(data: Omit<Rider, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Rider> {
  const rider: Rider = {
    ...data,
    id: `rdr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
  await ddb.send(new PutCommand({ TableName: TABLES.riders, Item: rider }))
  return rider
}

export async function updateRider(id: string, patch: Partial<Rider>): Promise<Rider | undefined> {
  const existing = await findRider(id)
  if (!existing) return undefined
  const updated: Rider = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  }
  await ddb.send(new PutCommand({ TableName: TABLES.riders, Item: updated }))
  return updated
}

export async function softDeleteRider(id: string): Promise<void> {
  const existing = await findRider(id)
  if (!existing) return
  await ddb.send(
    new PutCommand({
      TableName: TABLES.riders,
      Item: { ...existing, status: 'inactive', deletedAt: new Date().toISOString() },
    }),
  )
}

export async function hardDeleteRider(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.riders, Key: { id } }))
}
