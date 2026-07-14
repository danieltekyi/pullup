import { GetCommand, PutCommand, QueryCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'
import type { Vehicle } from '@pullup/shared'

export async function listVehicles(branchId?: string): Promise<Vehicle[]> {
  if (branchId) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLES.fleet,
        IndexName: 'gsi_branch',
        KeyConditionExpression: 'branchId = :b',
        ExpressionAttributeValues: { ':b': branchId },
      }),
    )
    return ((res.Items ?? []) as Vehicle[]).filter(v => !v.deletedAt)
  }
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.fleet }))
  return ((res.Items ?? []) as Vehicle[]).filter(v => !v.deletedAt)
}

export async function findVehicle(id: string): Promise<Vehicle | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.fleet, Key: { id } }))
  const v = res.Item as Vehicle | undefined
  return v?.deletedAt ? undefined : v
}

export async function createVehicle(data: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Vehicle> {
  const v: Vehicle = {
    ...data,
    id: `veh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
  await ddb.send(new PutCommand({ TableName: TABLES.fleet, Item: v }))
  return v
}

export async function updateVehicle(id: string, patch: Partial<Vehicle>): Promise<Vehicle | undefined> {
  const existing = await findVehicle(id)
  if (!existing) return undefined
  const updated: Vehicle = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  }
  await ddb.send(new PutCommand({ TableName: TABLES.fleet, Item: updated }))
  return updated
}

export async function softDeleteVehicle(id: string): Promise<void> {
  const existing = await findVehicle(id)
  if (!existing) return
  await ddb.send(
    new PutCommand({
      TableName: TABLES.fleet,
      Item: { ...existing, status: 'retired', deletedAt: new Date().toISOString() },
    }),
  )
}

export async function hardDeleteVehicle(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.fleet, Key: { id } }))
}
