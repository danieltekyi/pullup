import { GetCommand, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'
import type { Partner } from '@pullup/shared'

export async function listPartners(): Promise<Partner[]> {
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.partners }))
  return (res.Items ?? []) as Partner[]
}

export async function findPartner(id: string): Promise<Partner | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.partners, Key: { id } }))
  return res.Item as Partner | undefined
}

export async function createPartner(
  data: Omit<Partner, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
): Promise<Partner> {
  const partner: Partner = {
    ...data,
    id: `prt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
  await ddb.send(new PutCommand({ TableName: TABLES.partners, Item: partner }))
  return partner
}

export async function updatePartner(id: string, patch: Partial<Partner>): Promise<Partner | undefined> {
  const existing = await findPartner(id)
  if (!existing) return undefined
  const updated: Partner = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  }
  await ddb.send(new PutCommand({ TableName: TABLES.partners, Item: updated }))
  return updated
}

export async function deletePartner(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.partners, Key: { id } }))
}
