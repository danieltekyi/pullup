import { Hono } from 'hono'
import { z } from 'zod'
import type { Env, AppVariables } from '../env'
import { requireAuth } from '../middleware/access'
import { findOrder, updateOrder } from '../repos/orders'
import { logOrderEvent } from '../repos/orderEvents'
import type { SyncAction, SyncResult } from '@pullup/shared'
import { forbidden } from '../lib/errors'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

const actionSchema = z.object({
  clientActionId: z.string().min(1),
  type: z.enum(['assign', 'status', 'confirm', 'reject', 'fail', 'cod', 'proof']),
  orderId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  queuedAt: z.string(),
})

const bodySchema = z.object({ actions: z.array(actionSchema).min(1).max(200) })

app.post('/', requireAuth(), async c => {
  const body = bodySchema.parse(await c.req.json())
  const user = c.get('user')!
  const results: SyncResult[] = []

  for (const a of body.actions as SyncAction[]) {
    try {
      const order = await findOrder(c.env, a.orderId)
      if (!order) {
        results.push({ clientActionId: a.clientActionId, ok: false, reason: 'order_not_found' })
        continue
      }
      if (user.role === 'rider' && order.assignedTo !== user.riderId) throw forbidden('not your order')
      if (user.role !== 'super-admin' && order.branchId !== user.branchId) throw forbidden('branch scope')

      let updated = order
      const now = new Date().toISOString()
      if (a.type === 'status') {
        const status = a.payload.status as string
        updated = await updateOrder(c.env, order.id, {
          status: status as never,
          ...(status === 'picked_up' ? { pickedUpAt: now } : {}),
          ...(status === 'awaiting_confirmation' || status === 'delivered' ? { deliveredAt: now } : {}),
        })
      } else if (a.type === 'confirm') {
        updated = await updateOrder(c.env, order.id, {
          status: 'confirmed',
          confirmedAt: now,
          revenueStatus: order.revenueStatus === 'suspense' ? 'receivable' : order.revenueStatus,
        })
      } else if (a.type === 'reject') {
        updated = await updateOrder(c.env, order.id, { status: 'rejected', rejectedAt: now })
      } else if (a.type === 'assign') {
        updated = await updateOrder(c.env, order.id, {
          status: 'assigned',
          assignedTo: String(a.payload.riderId),
          cost: a.payload.cost ? Number(a.payload.cost) : order.cost,
        })
      } else if (a.type === 'fail') {
        updated = await updateOrder(c.env, order.id, {
          status: 'failed',
          failedAt: now,
          failureReason: a.payload.failureReason as never,
          failureNote: a.payload.failureNote as string,
        })
      } else if (a.type === 'cod') {
        updated = await updateOrder(c.env, order.id, { codCollected: Number(a.payload.amount) })
      } else if (a.type === 'proof') {
        updated = await updateOrder(c.env, order.id, { proof: a.payload as never })
      }
      await logOrderEvent(c.env, {
        orderId: order.id,
        type: (a.type as never) === 'status' ? ((a.payload.status as never) ?? 'note_added') : (a.type as never),
        actor: { sub: user.sub, email: user.email, role: user.role },
        before: order,
        after: updated,
        metadata: { via: 'sync', clientActionId: a.clientActionId },
      })
      results.push({ clientActionId: a.clientActionId, ok: true, order: updated })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      results.push({ clientActionId: a.clientActionId, ok: false, reason: msg })
    }
  }
  return c.json({ results, applied: results.filter(r => r.ok).length })
})

export default app
