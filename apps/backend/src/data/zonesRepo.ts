import { GetCommand, PutCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'

export interface Zone {
  id: string
  branchId: string
  name: string
  order: number
  polygon?: Array<{ lat: number; lng: number }>
  createdAt: string
  updatedAt: string
}

export async function listZones(branchId?: string): Promise<Zone[]> {
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.zones }))
  const all = (res.Items ?? []) as Zone[]
  return branchId ? all.filter(z => z.branchId === branchId) : all
}

export async function upsertZone(z: Zone): Promise<Zone> {
  const updated = { ...z, updatedAt: new Date().toISOString() }
  await ddb.send(new PutCommand({ TableName: TABLES.zones, Item: updated }))
  return updated
}

export async function findZone(id: string): Promise<Zone | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.zones, Key: { id } }))
  return res.Item as Zone | undefined
}

export async function deleteZone(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.zones, Key: { id } }))
}

export interface ZoneRate {
  key: string
  branchId: string
  rate: number
  updatedAt: string
}

export async function listZoneRates(branchId?: string): Promise<ZoneRate[]> {
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.zoneRates }))
  const all = (res.Items ?? []) as ZoneRate[]
  return branchId ? all.filter(r => r.branchId === branchId) : all
}

export async function upsertZoneRate(rate: ZoneRate): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLES.zoneRates,
      Item: { ...rate, updatedAt: new Date().toISOString() },
    }),
  )
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
