import type { Env } from '../env'
import { rowToObj } from '../lib/db'
import { nowIso } from '../lib/ids'
import { DEFAULT_PERMISSIONS, type Permissions, type Role } from '@pullup/shared'

export async function getPermissionsForRole(env: Env, role: Role): Promise<Permissions> {
  const row = await env.DB.prepare(`SELECT permissions FROM permissions WHERE role = ?`).bind(role).first<{ permissions: string }>()
  if (row?.permissions) {
    try { return JSON.parse(row.permissions) as Permissions } catch { /* fallback */ }
  }
  return DEFAULT_PERMISSIONS[role]
}

export async function setPermissionsForRole(env: Env, role: Role, perms: Permissions): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO permissions (role, permissions, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions, updated_at = excluded.updated_at`,
  )
    .bind(role, JSON.stringify(perms), nowIso())
    .run()
}

export async function listUsers(env: Env, branchId?: string) {
  const sql = branchId
    ? `SELECT * FROM users WHERE branch_id = ? ORDER BY name`
    : `SELECT * FROM users ORDER BY name`
  const stmt = branchId ? env.DB.prepare(sql).bind(branchId) : env.DB.prepare(sql)
  const res = await stmt.all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj(r))
}

export async function updateUser(env: Env, id: string, patch: { branchId?: string | null; managerId?: string | null; riderId?: string | null; status?: 'active' | 'inactive'; name?: string; role?: Role }) {
  const map: Record<string, string> = {
    branchId: 'branch_id', managerId: 'manager_id', riderId: 'rider_id', status: 'status', name: 'name', role: 'role',
  }
  const parts: string[] = []
  const values: unknown[] = []
  for (const [k, col] of Object.entries(map)) {
    if (k in patch) {
      parts.push(`${col} = ?`)
      values.push((patch as Record<string, unknown>)[k] ?? null)
    }
  }
  if (!parts.length) return
  await env.DB.prepare(`UPDATE users SET ${parts.join(', ')}, updated_at = ? WHERE id = ?`)
    .bind(...values, nowIso(), id)
    .run()
}
