import { GetCommand, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'

export interface Branch {
  id: string
  name: string
  city: string
  country: string
  currency: string
  timezone: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export async function listBranches(): Promise<Branch[]> {
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.branches }))
  return (res.Items ?? []) as Branch[]
}

export async function findBranch(id: string): Promise<Branch | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.branches, Key: { id } }))
  return res.Item as Branch | undefined
}

export async function upsertBranch(b: Branch): Promise<Branch> {
  const updated: Branch = { ...b, updatedAt: new Date().toISOString() }
  await ddb.send(new PutCommand({ TableName: TABLES.branches, Item: updated }))
  return updated
}

export async function deleteBranch(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.branches, Key: { id } }))
}
