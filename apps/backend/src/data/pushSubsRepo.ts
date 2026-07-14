import { GetCommand, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'

export interface PushSub {
  userId: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  createdAt: string
}

export async function subscribePush(sub: PushSub): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLES.pushSubs, Item: sub }))
}

export async function listPushSubs(userId: string): Promise<PushSub[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.pushSubs,
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    }),
  )
  return (res.Items ?? []) as PushSub[]
}

export async function unsubscribePush(userId: string, endpoint: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.pushSubs, Key: { userId, endpoint } }))
}

export async function findPushSub(userId: string, endpoint: string): Promise<PushSub | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLES.pushSubs, Key: { userId, endpoint } }),
  )
  return res.Item as PushSub | undefined
}
