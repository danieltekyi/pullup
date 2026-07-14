import type { Env } from '../env'
import { rowToObj } from '../lib/db'
import { newId, nowIso } from '../lib/ids'

export interface Zone {
  id: string
  branchId: string
  name: string
  ord: number
  polygon?: Array<{ lat: number; lng: number }>
  createdAt?: string
  updatedAt?: string
}

export async function listZones(env: Env, branchId?: string): Promise<Zone[]> {
  const sql = branchId
    ? `SELECT * FROM zones WHERE branch_id = ? ORDER BY ord`
    : `SELECT * FROM zones ORDER BY branch_id, ord`
  const stmt = branchId ? env.DB.prepare(sql).bind(branchId) : env.DB.prepare(sql)
  const res = await stmt.all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<Zone>(r, ['polygon'])!)
}

export async function upsertZone(env: Env, z: Zone): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO zones (id, branch_id, name, ord, polygon, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET branch_id=excluded.branch_id, name=excluded.name, ord=excluded.ord, polygon=excluded.polygon, updated_at=excluded.updated_at`,
  )
    .bind(z.id, z.branchId, z.name, z.ord, z.polygon ? JSON.stringify(z.polygon) : null, nowIso())
    .run()
}

export async function deleteZone(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM zones WHERE id = ?`).bind(id).run()
}

export async function listZoneRates(env: Env, branchId?: string): Promise<Record<string, number>> {
  const sql = branchId ? `SELECT pair_key, rate FROM zone_rates WHERE branch_id = ?` : `SELECT pair_key, rate FROM zone_rates`
  const stmt = branchId ? env.DB.prepare(sql).bind(branchId) : env.DB.prepare(sql)
  const res = await stmt.all<{ pair_key: string; rate: number }>()
  const out: Record<string, number> = {}
  for (const r of res.results ?? []) out[r.pair_key] = r.rate
  return out
}

export async function upsertZoneRate(env: Env, key: string, branchId: string, rate: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO zone_rates (pair_key, branch_id, rate, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(pair_key) DO UPDATE SET rate=excluded.rate, updated_at=excluded.updated_at`,
  )
    .bind(key, branchId, rate, nowIso())
    .run()
}

// -- Params --
export interface Param { id: string; category: string; key: string; value: string; label: string; updatedAt?: string }

export async function listParams(env: Env, category?: string): Promise<Param[]> {
  const sql = category ? `SELECT * FROM params WHERE category = ? ORDER BY key` : `SELECT * FROM params ORDER BY category, key`
  const stmt = category ? env.DB.prepare(sql).bind(category) : env.DB.prepare(sql)
  const res = await stmt.all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<Param>(r)!)
}

export async function upsertParam(env: Env, p: Param): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO params (id, category, key, value, label, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET value=excluded.value, label=excluded.label, updated_at=excluded.updated_at`,
  )
    .bind(p.id, p.category, p.key, p.value, p.label, nowIso())
    .run()
}

// -- Branches --
export interface Branch { id: string; name: string; city: string; country: string; currency: string; timezone: string; active: boolean; createdAt?: string; updatedAt?: string }

export async function listBranches(env: Env): Promise<Branch[]> {
  const res = await env.DB.prepare(`SELECT * FROM branches ORDER BY name`).all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<Branch>(r)!)
}

export async function findBranch(env: Env, id: string): Promise<Branch | undefined> {
  const row = await env.DB.prepare(`SELECT * FROM branches WHERE id = ?`).bind(id).first<Record<string, unknown>>()
  return rowToObj<Branch>(row)
}

export async function upsertBranch(env: Env, b: Branch): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO branches (id, name, city, country, currency, timezone, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, city=excluded.city, country=excluded.country, currency=excluded.currency, timezone=excluded.timezone, active=excluded.active, updated_at=excluded.updated_at`,
  )
    .bind(b.id, b.name, b.city, b.country, b.currency, b.timezone, b.active ? 1 : 0, nowIso())
    .run()
}

// -- Push subs --
export async function subscribePush(env: Env, userId: string, endpoint: string, p256dh: string, auth: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO push_subs (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth`,
  )
    .bind(userId, endpoint, p256dh, auth)
    .run()
}

export async function unsubscribePush(env: Env, userId: string, endpoint: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?`).bind(userId, endpoint).run()
}

export async function listPushSubs(env: Env, userId: string): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
  const res = await env.DB.prepare(`SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?`).bind(userId).all<{ endpoint: string; p256dh: string; auth: string }>()
  return res.results ?? []
}
