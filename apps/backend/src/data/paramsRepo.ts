import { GetCommand, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'

export interface Param {
  id: string
  category: string
  key: string
  value: string
  label: string
  updatedAt: string
}

export async function listParams(category?: string): Promise<Param[]> {
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.params }))
  const all = (res.Items ?? []) as Param[]
  return category ? all.filter(p => p.category === category) : all
}

export async function upsertParam(p: Param): Promise<void> {
  await ddb.send(
    new PutCommand({ TableName: TABLES.params, Item: { ...p, updatedAt: new Date().toISOString() } }),
  )
}

export async function findParam(id: string): Promise<Param | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.params, Key: { id } }))
  return res.Item as Param | undefined
}

export async function deleteParam(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.params, Key: { id } }))
}
