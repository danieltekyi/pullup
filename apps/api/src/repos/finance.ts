import type { Env } from '../env'
import { rowToObj } from '../lib/db'
import { newId, nowIso } from '../lib/ids'
import type { Expenditure, Order } from '@pullup/shared'

export async function listExpenditures(env: Env, branchId?: string, from?: string, to?: string): Promise<Expenditure[]> {
  const parts: string[] = ['deleted_at IS NULL']
  const values: unknown[] = []
  if (branchId) { parts.push('branch_id = ?'); values.push(branchId) }
  if (from) { parts.push('date >= ?'); values.push(from) }
  if (to) { parts.push('date <= ?'); values.push(to) }
  const sql = `SELECT * FROM expenditures WHERE ${parts.join(' AND ')} ORDER BY date DESC LIMIT 500`
  const res = await env.DB.prepare(sql).bind(...values).all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<Expenditure>(r)!)
}

export async function createExpenditure(env: Env, data: Partial<Expenditure> & { branchId: string; category: string; description: string; amount: number; date: string }): Promise<Expenditure> {
  const id = newId('exp')
  const now = nowIso()
  await env.DB.prepare(
    `INSERT INTO expenditures (id, branch_id, category, description, amount, date, vehicle_id, rider_id, created_by, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(id, data.branchId, data.category, data.description, data.amount, data.date, data.vehicleId ?? null, data.riderId ?? null, data.createdBy ?? null, now, now)
    .run()
  const row = await env.DB.prepare(`SELECT * FROM expenditures WHERE id = ?`).bind(id).first<Record<string, unknown>>()
  return rowToObj<Expenditure>(row)!
}

export async function softDeleteExpenditure(env: Env, id: string): Promise<boolean> {
  const res = await env.DB.prepare(`UPDATE expenditures SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .bind(nowIso(), id)
    .run()
  return (res.meta.changes ?? 0) > 0
}

export async function financeSummary(env: Env, branchId?: string, from?: string, to?: string): Promise<{
  totalRevenue: number
  totalExpenditures: number
  netRevenue: number
  byCategory: Record<string, number>
  revenueBreakdown: { suspense: number; receivable: number; paid: number; untagged: number }
  codOutstanding: number
}> {
  // Orders — revenue + COD calc
  const ordersParts: string[] = ['deleted_at IS NULL']
  const ordersValues: unknown[] = []
  if (branchId) { ordersParts.push('branch_id = ?'); ordersValues.push(branchId) }
  if (from) { ordersParts.push('created_at >= ?'); ordersValues.push(from) }
  if (to) { ordersParts.push('created_at <= ?'); ordersValues.push(to) }
  const oSql = `SELECT cost, payment_method, cod_collected, revenue_status FROM orders WHERE ${ordersParts.join(' AND ')}`
  const ord = await env.DB.prepare(oSql).bind(...ordersValues).all<Order & { payment_method?: string; cod_collected?: number; revenue_status?: string }>()

  let totalRevenue = 0, suspense = 0, receivable = 0, paid = 0, untagged = 0, codOutstanding = 0
  for (const o of ord.results ?? []) {
    const amt = Number(o.cost ?? 0)
    if (o.payment_method === 'cod') {
      const collected = Number(o.cod_collected ?? 0)
      codOutstanding += Math.max(amt - collected, 0)
    }
    if (!amt) continue
    totalRevenue += amt
    if (o.revenue_status === 'suspense') suspense += amt
    else if (o.revenue_status === 'receivable') receivable += amt
    else if (o.revenue_status === 'paid') paid += amt
    else untagged += amt
  }

  // Expenditures — total + by category
  const expParts: string[] = ['deleted_at IS NULL']
  const expValues: unknown[] = []
  if (branchId) { expParts.push('branch_id = ?'); expValues.push(branchId) }
  if (from) { expParts.push('date >= ?'); expValues.push(from) }
  if (to) { expParts.push('date <= ?'); expValues.push(to) }
  const eSql = `SELECT category, SUM(amount) AS total FROM expenditures WHERE ${expParts.join(' AND ')} GROUP BY category`
  const exp = await env.DB.prepare(eSql).bind(...expValues).all<{ category: string; total: number }>()
  const byCategory: Record<string, number> = {}
  let totalExpenditures = 0
  for (const row of exp.results ?? []) {
    byCategory[row.category] = row.total
    totalExpenditures += row.total
  }

  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    totalRevenue: r2(totalRevenue),
    totalExpenditures: r2(totalExpenditures),
    netRevenue: r2(totalRevenue - totalExpenditures),
    byCategory,
    revenueBreakdown: { suspense: r2(suspense), receivable: r2(receivable), paid: r2(paid), untagged: r2(untagged) },
    codOutstanding: r2(codOutstanding),
  }
}
