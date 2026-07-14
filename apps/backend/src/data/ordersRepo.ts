import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'
import type { Order, OrderStatus } from '@pullup/shared'
import { conflict, notFound } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

const nowIso = () => new Date().toISOString()

export interface ListOrdersFilters {
  branchId?: string
  status?: OrderStatus | OrderStatus[]
  riderId?: string
  partnerId?: string
  customerId?: string
  from?: string
  to?: string
  q?: string
  limit?: number
  cursor?: string
}

export async function findOrder(id: string): Promise<Order | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.orders, Key: { id } }))
  const item = res.Item as Order | undefined
  if (item?.deletedAt) return undefined
  return item
}

export async function listOrders(filters: ListOrdersFilters = {}): Promise<{ items: Order[]; cursor?: string }> {
  const limit = Math.min(filters.limit ?? 50, 200)

  // Branch scoping happens on a GSI when branchId is set — cheap.
  if (filters.branchId) {
    const cmd = new QueryCommand({
      TableName: TABLES.orders,
      IndexName: 'gsi_branch_created',
      KeyConditionExpression: 'branchId = :b',
      ExpressionAttributeValues: { ':b': filters.branchId },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: decodeCursor(filters.cursor),
    })
    const res = await ddb.send(cmd)
    return applyClientFilters(res, filters)
  }

  if (filters.riderId) {
    const cmd = new QueryCommand({
      TableName: TABLES.orders,
      IndexName: 'gsi_rider_created',
      KeyConditionExpression: 'assignedTo = :r',
      ExpressionAttributeValues: { ':r': filters.riderId },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: decodeCursor(filters.cursor),
    })
    const res = await ddb.send(cmd)
    return applyClientFilters(res, filters)
  }

  // Super-admin unfiltered — full scan (rare, dev-only).
  const scan = new ScanCommand({
    TableName: TABLES.orders,
    Limit: limit,
    ExclusiveStartKey: decodeCursor(filters.cursor),
  })
  const res = await ddb.send(scan)
  return applyClientFilters(res, filters)
}

function applyClientFilters(
  res: { Items?: Record<string, unknown>[]; LastEvaluatedKey?: Record<string, unknown> },
  f: ListOrdersFilters,
): { items: Order[]; cursor?: string } {
  let items = (res.Items ?? []) as Order[]
  items = items.filter(o => !o.deletedAt)

  if (f.status) {
    const arr = Array.isArray(f.status) ? f.status : [f.status]
    items = items.filter(o => arr.includes(o.status))
  }
  if (f.partnerId) items = items.filter(o => o.partnerId === f.partnerId)
  if (f.customerId) items = items.filter(o => o.customerId === f.customerId)
  if (f.from) items = items.filter(o => o.createdAt >= f.from!)
  if (f.to) items = items.filter(o => o.createdAt <= f.to!)
  if (f.q) {
    const q = f.q.toLowerCase()
    items = items.filter(
      o =>
        o.customerName?.toLowerCase().includes(q) ||
        o.destination?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.customerPhone?.includes(q),
    )
  }

  return { items, cursor: encodeCursor(res.LastEvaluatedKey) }
}

function encodeCursor(key: Record<string, unknown> | undefined): string | undefined {
  if (!key) return undefined
  return Buffer.from(JSON.stringify(key)).toString('base64url')
}

function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) return undefined
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
}

export async function findOrderByPartnerRef(
  partnerId: string,
  partnerOrderId: string,
): Promise<Order | undefined> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.orders,
      IndexName: 'gsi_partner_ref',
      KeyConditionExpression: 'partnerId = :p AND partnerOrderId = :o',
      ExpressionAttributeValues: { ':p': partnerId, ':o': partnerOrderId },
      Limit: 1,
    }),
  )
  return res.Items?.[0] as Order | undefined
}

export async function createOrder(
  data: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'revenueStatus'> & {
    id?: string
    revenueStatus?: Order['revenueStatus']
  },
): Promise<Order> {
  const order: Order = {
    ...data,
    id: data.id ?? `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 1,
    revenueStatus: data.revenueStatus ?? 'none',
  } as Order
  await ddb.send(
    new PutCommand({
      TableName: TABLES.orders,
      Item: order,
      ConditionExpression: 'attribute_not_exists(id)',
    }),
  )
  return order
}

/**
 * Optimistic-concurrency update: uses UpdateExpression + version check to avoid
 * read-modify-write races. Returns the updated order.
 */
export async function updateOrder(
  id: string,
  patch: Partial<Order>,
  expectedVersion?: number,
): Promise<Order> {
  const existing = await findOrder(id)
  if (!existing) throw notFound('order not found')
  const version = expectedVersion ?? existing.version

  const keys = Object.keys(patch).filter(k => k !== 'id' && k !== 'version' && k !== 'createdAt')
  const setExpr: string[] = ['#updatedAt = :updatedAt', '#version = #version + :one']
  const names: Record<string, string> = { '#updatedAt': 'updatedAt', '#version': 'version' }
  const values: Record<string, unknown> = { ':updatedAt': nowIso(), ':one': 1, ':v': version }
  for (const k of keys) {
    names[`#${k}`] = k
    values[`:${k}`] = (patch as Record<string, unknown>)[k]
    setExpr.push(`#${k} = :${k}`)
  }
  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLES.orders,
        Key: { id },
        UpdateExpression: `SET ${setExpr.join(', ')}`,
        ConditionExpression: '#version = :v',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }),
    )
    return res.Attributes as Order
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name === 'ConditionalCheckFailedException') {
      throw conflict('order was modified by another request; retry')
    }
    logger.error({ err }, 'updateOrder failed')
    throw err
  }
}

export async function softDeleteOrder(id: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.orders,
      Key: { id },
      UpdateExpression: 'SET deletedAt = :d, #status = :s, updatedAt = :u',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':d': nowIso(), ':s': 'cancelled', ':u': nowIso() },
    }),
  )
}

export async function hardDeleteOrder(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.orders, Key: { id } }))
}
