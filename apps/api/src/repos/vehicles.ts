import type { Env } from '../env'
import { rowToObj } from '../lib/db'
import { newId, nowIso } from '../lib/ids'
import type { Vehicle } from '@pullup/shared'

const JSON_COLS = ['tracker_config']

export async function listVehicles(env: Env, branchId?: string): Promise<Vehicle[]> {
  const sql = branchId
    ? `SELECT * FROM vehicles WHERE branch_id = ? AND deleted_at IS NULL ORDER BY registration`
    : `SELECT * FROM vehicles WHERE deleted_at IS NULL ORDER BY registration`
  const stmt = branchId ? env.DB.prepare(sql).bind(branchId) : env.DB.prepare(sql)
  const res = await stmt.all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<Vehicle>(r, JSON_COLS)!)
}

export async function findVehicle(env: Env, id: string): Promise<Vehicle | undefined> {
  const row = await env.DB.prepare(`SELECT * FROM vehicles WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<Record<string, unknown>>()
  return rowToObj<Vehicle>(row, JSON_COLS)
}

export async function createVehicle(env: Env, data: Partial<Vehicle> & { branchId: string; make: string; model: string; registration: string }): Promise<Vehicle> {
  const id = newId('veh')
  const now = nowIso()
  await env.DB.prepare(
    `INSERT INTO vehicles (id, branch_id, make, model, registration, status, tracker_config, insurance_expiry, license_expiry, odometer_km, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(
      id,
      data.branchId,
      data.make,
      data.model,
      data.registration,
      data.status ?? 'available',
      data.trackerConfig ? JSON.stringify(data.trackerConfig) : null,
      data.insuranceExpiry ?? null,
      data.licenseExpiry ?? null,
      data.odometerKm ?? null,
      now,
      now,
    )
    .run()
  return (await findVehicle(env, id))!
}

export async function updateVehicle(env: Env, id: string, patch: Partial<Vehicle>): Promise<Vehicle | undefined> {
  const existing = await findVehicle(env, id)
  if (!existing) return undefined
  const map: Record<string, string> = {
    make: 'make', model: 'model', registration: 'registration', status: 'status',
    trackerConfig: 'tracker_config', insuranceExpiry: 'insurance_expiry',
    licenseExpiry: 'license_expiry', odometerKm: 'odometer_km',
  }
  const parts: string[] = []
  const values: unknown[] = []
  for (const [k, col] of Object.entries(map)) {
    if (k in patch) {
      parts.push(`${col} = ?`)
      const v = (patch as Record<string, unknown>)[k]
      values.push(v && typeof v === 'object' ? JSON.stringify(v) : v ?? null)
    }
  }
  if (!parts.length) return existing
  await env.DB.prepare(
    `UPDATE vehicles SET ${parts.join(', ')}, updated_at = ?, version = version + 1 WHERE id = ?`,
  )
    .bind(...values, nowIso(), id)
    .run()
  return findVehicle(env, id)
}

export async function softDeleteVehicle(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE vehicles SET deleted_at = ?, status = 'retired' WHERE id = ?`)
    .bind(nowIso(), id)
    .run()
}
