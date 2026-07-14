import type { Env } from '../env'
import { rowToObj } from '../lib/db'
import { newId, nowIso } from '../lib/ids'
import type { OrderEvent } from '@pullup/shared'

export async function logOrderEvent(env: Env, event: Omit<OrderEvent, 'id' | 'at'>): Promise<void> {
  const id = newId('evt')
  await env.DB.prepare(
    `INSERT INTO order_events (id, order_id, type, actor, at, before_state, after_state, note, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      event.orderId,
      event.type,
      JSON.stringify(event.actor),
      nowIso(),
      event.before ? JSON.stringify(event.before) : null,
      event.after ? JSON.stringify(event.after) : null,
      event.note ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
    )
    .run()
}

export async function listOrderEvents(env: Env, orderId: string, limit = 200): Promise<OrderEvent[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM order_events WHERE order_id = ? ORDER BY at DESC LIMIT ?`,
  )
    .bind(orderId, Math.min(limit, 500))
    .all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<OrderEvent>(r, ['actor', 'before_state', 'after_state', 'metadata'])!)
}
