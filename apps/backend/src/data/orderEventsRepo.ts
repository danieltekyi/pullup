import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'
import type { OrderEvent } from '@pullup/shared'
import { randomUUID } from 'crypto'

export async function logOrderEvent(event: Omit<OrderEvent, 'id' | 'at'>): Promise<OrderEvent> {
  const item: OrderEvent = {
    ...event,
    id: `evt_${Date.now()}_${randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
  }
  await ddb.send(new PutCommand({ TableName: TABLES.orderEvents, Item: item }))
  return item
}

export async function listOrderEvents(orderId: string, limit = 100): Promise<OrderEvent[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.orderEvents,
      KeyConditionExpression: 'orderId = :o',
      ExpressionAttributeValues: { ':o': orderId },
      ScanIndexForward: false,
      Limit: limit,
    }),
  )
  return (res.Items ?? []) as OrderEvent[]
}
