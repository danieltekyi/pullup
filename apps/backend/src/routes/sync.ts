import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { findOrder, updateOrder } from '../data/ordersRepo.js'
import { logOrderEvent } from '../data/orderEventsRepo.js'
import type { SyncAction, SyncResult } from '@pullup/shared'
import { forbidden, notFound } from '../lib/errors.js'

const router = Router()

const actionSchema = z.object({
  clientActionId: z.string().min(1),
  type: z.enum(['assign', 'status', 'confirm', 'reject', 'fail', 'cod', 'proof']),
  orderId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  queuedAt: z.string(),
})

const bodySchema = z.object({
  actions: z.array(actionSchema).min(1).max(200),
})

/**
 * Batched offline-sync endpoint.
 *
 * Returns a per-action result array with `clientActionId` and `ok/reason` so
 * the client can dequeue exactly the successful actions (fixes the "dequeue
 * first N" bug from v1).
 */
router.post(
  '/',
  requireAuth,
  validateBody(bodySchema),
  asyncHandler(async (req, res) => {
    const user = req.user!
    const actions = req.body.actions as SyncAction[]
    const results: SyncResult[] = []

    for (const a of actions) {
      try {
        const order = await findOrder(a.orderId)
        if (!order) {
          results.push({ clientActionId: a.clientActionId, ok: false, reason: 'order_not_found' })
          continue
        }
        if (user.role === 'rider' && order.assignedTo !== user.riderId) {
          throw forbidden('not your order')
        }
        if (user.role !== 'super-admin' && user.branchId && order.branchId !== user.branchId) {
          throw forbidden('branch scope')
        }

        let updated = order
        if (a.type === 'status') {
          const status = a.payload.status as string
          updated = await updateOrder(order.id, {
            status: status as never,
            ...(status === 'picked_up' ? { pickedUpAt: new Date().toISOString() } : {}),
            ...(status === 'awaiting_confirmation' || status === 'delivered'
              ? { deliveredAt: new Date().toISOString() }
              : {}),
          })
        } else if (a.type === 'confirm') {
          updated = await updateOrder(order.id, {
            status: 'confirmed',
            confirmedAt: new Date().toISOString(),
            revenueStatus: order.revenueStatus === 'suspense' ? 'receivable' : order.revenueStatus,
          })
        } else if (a.type === 'reject') {
          updated = await updateOrder(order.id, {
            status: 'rejected',
            rejectedAt: new Date().toISOString(),
          })
        } else if (a.type === 'assign') {
          updated = await updateOrder(order.id, {
            status: 'assigned',
            assignedTo: String(a.payload.riderId),
            cost: a.payload.cost ? Number(a.payload.cost) : order.cost,
          })
        } else if (a.type === 'fail') {
          updated = await updateOrder(order.id, {
            status: 'failed',
            failedAt: new Date().toISOString(),
            failureReason: a.payload.failureReason as never,
            failureNote: a.payload.failureNote as string,
          })
        } else if (a.type === 'cod') {
          updated = await updateOrder(order.id, {
            codCollected: Number(a.payload.amount),
          })
        } else if (a.type === 'proof') {
          updated = await updateOrder(order.id, {
            proof: a.payload as never,
          })
        }
        await logOrderEvent({
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

    res.json({ results, applied: results.filter(r => r.ok).length })
  }),
)

export default router
