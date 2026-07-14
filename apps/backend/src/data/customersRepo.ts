import { GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'
import type { Customer } from '@pullup/shared'

export async function listCustomers(branchId?: string): Promise<Customer[]> {
  if (branchId) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLES.customers,
        IndexName: 'gsi_branch',
        KeyConditionExpression: 'branchId = :b',
        ExpressionAttributeValues: { ':b': branchId },
      }),
    )
    return (res.Items ?? []) as Customer[]
  }
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.customers }))
  return (res.Items ?? []) as Customer[]
}

export async function findCustomer(id: string): Promise<Customer | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.customers, Key: { id } }))
  return res.Item as Customer | undefined
}

export async function findCustomerByPhone(branchId: string, phone: string): Promise<Customer | undefined> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.customers,
      IndexName: 'gsi_phone',
      KeyConditionExpression: 'phone = :p',
      ExpressionAttributeValues: { ':p': phone },
      Limit: 5,
    }),
  )
  return ((res.Items ?? []) as Customer[]).find(c => c.branchId === branchId)
}

export async function upsertCustomer(c: Customer): Promise<Customer> {
  const updated: Customer = { ...c, updatedAt: new Date().toISOString() }
  await ddb.send(new PutCommand({ TableName: TABLES.customers, Item: updated }))
  return updated
}

export async function findOrCreateCustomer(params: {
  branchId: string
  phone: string
  name: string
  address?: string
}): Promise<Customer> {
  const existing = await findCustomerByPhone(params.branchId, params.phone)
  if (existing) return existing
  const now = new Date().toISOString()
  return upsertCustomer({
    id: `cus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    branchId: params.branchId,
    name: params.name,
    phone: params.phone,
    addresses: params.address ? [{ label: 'default', text: params.address }] : [],
    totalOrders: 0,
    totalSpent: 0,
    createdAt: now,
    updatedAt: now,
  })
}
