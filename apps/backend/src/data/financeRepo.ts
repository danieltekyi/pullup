import { GetCommand, PutCommand, QueryCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLES } from '../lib/ddb.js'
import type { Expenditure } from '@pullup/shared'
import { listOrders } from './ordersRepo.js'

export async function listExpenditures(branchId?: string, from?: string, to?: string): Promise<Expenditure[]> {
  if (branchId) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLES.expenditures,
        IndexName: 'gsi_branch_date',
        KeyConditionExpression:
          from && to
            ? 'branchId = :b AND #date BETWEEN :from AND :to'
            : 'branchId = :b',
        ExpressionAttributeNames: from && to ? { '#date': 'date' } : undefined,
        ExpressionAttributeValues:
          from && to
            ? { ':b': branchId, ':from': from, ':to': to }
            : { ':b': branchId },
        ScanIndexForward: false,
      }),
    )
    return ((res.Items ?? []) as Expenditure[]).filter(e => !e.deletedAt)
  }
  const res = await ddb.send(new ScanCommand({ TableName: TABLES.expenditures }))
  return ((res.Items ?? []) as Expenditure[]).filter(e => !e.deletedAt)
}

export async function findExpenditure(id: string): Promise<Expenditure | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: TABLES.expenditures, Key: { id } }))
  const e = res.Item as Expenditure | undefined
  return e?.deletedAt ? undefined : e
}

export async function createExpenditure(
  data: Omit<Expenditure, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
): Promise<Expenditure> {
  const exp: Expenditure = {
    ...data,
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
  await ddb.send(new PutCommand({ TableName: TABLES.expenditures, Item: exp }))
  return exp
}

export async function softDeleteExpenditure(id: string): Promise<boolean> {
  const existing = await findExpenditure(id)
  if (!existing) return false
  await ddb.send(
    new PutCommand({
      TableName: TABLES.expenditures,
      Item: { ...existing, deletedAt: new Date().toISOString() },
    }),
  )
  return true
}

export async function hardDeleteExpenditure(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLES.expenditures, Key: { id } }))
}

export async function getFinanceSummary(branchId?: string, from?: string, to?: string) {
  const [ordersRes, expenditures] = await Promise.all([
    listOrders({ branchId, from, to, limit: 200 }),
    listExpenditures(branchId, from, to),
  ])
  const orders = ordersRes.items
  const totalRevenue = orders.reduce((sum, o) => sum + (o.cost ?? 0), 0)
  const totalExpenditures = expenditures.reduce((sum, e) => sum + e.amount, 0)

  const byCategory: Record<string, number> = {}
  for (const e of expenditures) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount
  }

  let suspense = 0
  let receivable = 0
  let paid = 0
  let untagged = 0
  let codOutstanding = 0
  for (const o of orders) {
    const amt = o.cost ?? 0
    if (o.paymentMethod === 'cod') {
      const collected = o.codCollected ?? 0
      codOutstanding += Math.max(amt - collected, 0)
    }
    if (!amt) continue
    if (o.revenueStatus === 'suspense') suspense += amt
    else if (o.revenueStatus === 'receivable') receivable += amt
    else if (o.revenueStatus === 'paid') paid += amt
    else untagged += amt
  }

  return {
    totalRevenue,
    totalExpenditures,
    netRevenue: totalRevenue - totalExpenditures,
    byCategory,
    revenueBreakdown: {
      suspense: round(suspense),
      receivable: round(receivable),
      paid: round(paid),
      untagged: round(untagged),
    },
    codOutstanding: round(codOutstanding),
  }
}

const round = (n: number) => Math.round(n * 100) / 100
