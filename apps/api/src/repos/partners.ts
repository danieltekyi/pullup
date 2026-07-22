import type { Env } from '../env'
import { rowToObj } from '../lib/db'
import { newId, nowIso } from '../lib/ids'
import type { Partner } from '@pullup/shared'

export async function listPartners(env: Env): Promise<Partner[]> {
  const res = await env.DB.prepare(`SELECT * FROM partners ORDER BY name`).all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<Partner>(r)!)
}

export async function findPartner(env: Env, id: string): Promise<Partner | undefined> {
  const row = await env.DB.prepare(`SELECT * FROM partners WHERE id = ?`).bind(id).first<Record<string, unknown>>()
  return rowToObj<Partner>(row)
}

export async function createPartner(env: Env, data: Partial<Partner> & { name: string; email?: string }): Promise<Partner> {
  const id = newId('prt')
  const now = nowIso()
  await env.DB.prepare(
    `INSERT INTO partners (id, branch_id, name, email, get_url, put_url_template, api_key, webhook_secret, active, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  )
    .bind(id, data.branchId ?? null, data.name, (data as any).email ?? null, data.getUrl ?? null, data.putUrlTemplate ?? null, data.apiKey ?? null, data.webhookSecret ?? null, data.active === false ? 0 : 1, now, now)
    .run()
  return (await findPartner(env, id))!
}

export async function updatePartner(env: Env, id: string, patch: Partial<Partner> & { email?: string }): Promise<Partner | undefined> {
  const map: Record<string, string> = {
    branchId: 'branch_id', name: 'name', email: 'email', getUrl: 'get_url', putUrlTemplate: 'put_url_template',
    apiKey: 'api_key', webhookSecret: 'webhook_secret', active: 'active', lastFetchedAt: 'last_fetched_at',
  }
  const parts: string[] = []
  const values: unknown[] = []
  for (const [k, col] of Object.entries(map)) {
    if (k in patch) {
      parts.push(`${col} = ?`)
      let v: unknown = (patch as Record<string, unknown>)[k]
      if (typeof v === 'boolean') v = v ? 1 : 0
      values.push(v ?? null)
    }
  }
  if (!parts.length) return findPartner(env, id)
  await env.DB.prepare(`UPDATE partners SET ${parts.join(', ')}, updated_at = ?, version = version + 1 WHERE id = ?`)
    .bind(...values, nowIso(), id)
    .run()
  return findPartner(env, id)
}

export async function deletePartner(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM partners WHERE id = ?`).bind(id).run()
}
