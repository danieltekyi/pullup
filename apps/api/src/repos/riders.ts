import type { Env } from '../env'
import { rowToObj } from '../lib/db'
import { newId, nowIso } from '../lib/ids'
import type { Rider } from '@pullup/shared'

export async function listRiders(env: Env, branchId?: string): Promise<Rider[]> {
  const sql = branchId
    ? `SELECT * FROM riders WHERE branch_id = ? AND deleted_at IS NULL ORDER BY name`
    : `SELECT * FROM riders WHERE deleted_at IS NULL ORDER BY name`
  const stmt = branchId ? env.DB.prepare(sql).bind(branchId) : env.DB.prepare(sql)
  const res = await stmt.all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<Rider>(r, ['documents'])!)
}

export async function findRider(env: Env, id: string): Promise<Rider | undefined> {
  const row = await env.DB.prepare(`SELECT * FROM riders WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<Record<string, unknown>>()
  return rowToObj<Rider>(row, ['documents'])
}

export async function createRider(env: Env, data: Partial<Rider> & { name: string; phone: string; zone: string; branchId: string }): Promise<Rider> {
  const id = newId('rdr')
  const now = nowIso()
  await env.DB.prepare(
    `INSERT INTO riders (id, name, phone, email, zone, branch_id, manager_id, status, vehicle_id, rate_per_delivery, rate_pct_of_fee, documents, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(
      id,
      data.name,
      data.phone,
      data.email ?? null,
      data.zone,
      data.branchId,
      data.managerId ?? null,
      data.status ?? 'active',
      data.vehicleId ?? null,
      data.ratePerDelivery ?? null,
      data.ratePctOfFee ?? null,
      data.documents ? JSON.stringify(data.documents) : null,
      now,
      now,
    )
    .run()
  return (await findRider(env, id))!
}

export async function updateRider(env: Env, id: string, patch: Partial<Rider>): Promise<Rider | undefined> {
  const existing = await findRider(env, id)
  if (!existing) return undefined
  const parts: string[] = []
  const values: unknown[] = []
  const map: Record<string, string> = {
    name: 'name', phone: 'phone', email: 'email', zone: 'zone',
    branchId: 'branch_id', managerId: 'manager_id', status: 'status',
    vehicleId: 'vehicle_id', ratePerDelivery: 'rate_per_delivery', ratePctOfFee: 'rate_pct_of_fee',
    documents: 'documents',
  }
  for (const [k, col] of Object.entries(map)) {
    if (k in patch) {
      parts.push(`${col} = ?`)
      const v = (patch as Record<string, unknown>)[k]
      values.push(v && typeof v === 'object' ? JSON.stringify(v) : v ?? null)
    }
  }
  if (!parts.length) return existing
  await env.DB.prepare(
    `UPDATE riders SET ${parts.join(', ')}, updated_at = ?, version = version + 1 WHERE id = ?`,
  )
    .bind(...values, nowIso(), id)
    .run()
  return findRider(env, id)
}

export async function softDeleteRider(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE riders SET deleted_at = ?, status = 'inactive' WHERE id = ?`)
    .bind(nowIso(), id)
    .run()
}
