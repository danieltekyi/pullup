import { Router } from 'express'
import multer from 'multer'
import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { asyncHandler, validateBody, validateQuery } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { getBranchFilter, getRiderFilter } from '../middleware/branchScope.js'
import {
  createOrder,
  findOrder,
  hardDeleteOrder,
  listOrders,
  softDeleteOrder,
  updateOrder,
} from '../data/ordersRepo.js'
import { logOrderEvent, listOrderEvents } from '../data/orderEventsRepo.js'
import { findOrCreateCustomer } from '../data/customersRepo.js'
import { notifyPartner } from '../services/partnerFetcher.js'
import { sendPushToUser } from '../services/notifications/push.js'
import { sendSms } from '../services/notifications/sms.js'
import { presignUpload } from '../services/storage/s3.js'
import { badRequest, forbidden, notFound, unprocessable } from '../lib/errors.js'
import type { AuditActor, Order } from '@pullup/shared'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

const listQuerySchema = z.object({
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(v => (v === undefined ? undefined : Array.isArray(v) ? v : v.split(','))),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
  partnerId: z.string().optional(),
  customerId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  cursor: z.string().optional(),
  branchId: z.string().optional(),
})

function actorFromReq(req: {
  user?: { sub: string; email?: string; role: 'super-admin' | 'manager' | 'rider' }
  ip?: string
}): AuditActor {
  return { sub: req.user!.sub, email: req.user!.email, role: req.user!.role, ip: req.ip }
}

// LIST — supports pagination, filters, search
router.get(
  '/',
  requireAuth,
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    const riderId = getRiderFilter(req)
    const q = req.query as unknown as z.infer<typeof listQuerySchema>
    const result = await listOrders({
      branchId,
      riderId,
      status: q.status as never,
      from: q.from,
      to: q.to,
      q: q.q,
      partnerId: q.partnerId,
      customerId: q.customerId,
      limit: q.limit,
      cursor: q.cursor,
    })
    res.json(result)
  }),
)

// GET one
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.params.id)
    if (!order) throw notFound('order not found')
    if (req.user!.role !== 'super-admin' && req.user!.branchId && order.branchId !== req.user!.branchId) {
      throw forbidden()
    }
    res.json(order)
  }),
)

// Order event log
router.get(
  '/:id/events',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.params.id)
    if (!order) throw notFound('order not found')
    if (req.user!.role !== 'super-admin' && req.user!.branchId && order.branchId !== req.user!.branchId) {
      throw forbidden()
    }
    const events = await listOrderEvents(req.params.id)
    res.json({ items: events })
  }),
)

const createSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  destination: z.string().min(1),
  destinationZone: z.string().optional(),
  originZone: z.string().optional(),
  priority: z.enum(['low', 'normal', 'urgent']).default('normal'),
  weight: z.number().nonnegative().optional(),
  parcelCount: z.number().int().positive().optional(),
  description: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  pricingMode: z.enum(['zone', 'physics', 'manual']).optional(),
  paymentMethod: z.enum(['prepaid', 'cod', 'invoice']).default('prepaid'),
  slaBy: z.string().datetime().optional(),
  idempotencyKey: z.string().optional(),
})

router.post(
  '/',
  requireAuth,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const user = req.user!
    if (!user.branchId && user.role !== 'super-admin') throw badRequest('no branch assignment')
    const branchId = user.branchId ?? (req.body.branchId as string | undefined) ?? 'default'

    let customerId: string | undefined
    if (req.body.customerPhone) {
      const cust = await findOrCreateCustomer({
        branchId,
        phone: req.body.customerPhone,
        name: req.body.customerName,
        address: req.body.destination,
      })
      customerId = cust.id
    }

    const order = await createOrder({
      branchId,
      status: 'pending',
      priority: req.body.priority,
      customerId,
      customerName: req.body.customerName,
      customerPhone: req.body.customerPhone,
      destination: req.body.destination,
      destinationZone: req.body.destinationZone,
      originZone: req.body.originZone,
      weight: req.body.weight,
      parcelCount: req.body.parcelCount,
      description: req.body.description,
      cost: req.body.cost,
      pricingMode: req.body.pricingMode,
      paymentMethod: req.body.paymentMethod,
      slaBy: req.body.slaBy,
      createdBy: user.sub,
    } as never)

    await logOrderEvent({ orderId: order.id, type: 'created', actor: actorFromReq(req), after: order })
    res.status(201).json(order)
  }),
)

const assignSchema = z.object({
  riderId: z.string().min(1),
  cost: z.number().nonnegative().optional(),
  bikeId: z.string().optional(),
})

router.post(
  '/:id/assign',
  requireAuth,
  validateBody(assignSchema),
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.params.id)
    if (!order) throw notFound('order not found')

    const effectiveCost = req.body.cost ?? order.cost
    if (order.partnerId && !effectiveCost) {
      throw unprocessable('Delivery fee required before assigning a partner order.')
    }
    const before = { ...order }
    const updated = await updateOrder(order.id, {
      assignedTo: req.body.riderId,
      assignedAt: new Date().toISOString(),
      status: 'assigned',
      cost: effectiveCost,
      bikeId: req.body.bikeId ?? order.bikeId,
    })
    await logOrderEvent({
      orderId: order.id,
      type: order.assignedTo ? 'reassigned' : 'assigned',
      actor: actorFromReq(req),
      before,
      after: updated,
    })
    void sendPushToUser(req.body.riderId, {
      title: 'New delivery assigned',
      body: `${updated.customerName} — ${updated.destination}`,
      url: '/rider',
    }).catch(() => undefined)
    res.json(updated)
  }),
)

const bulkAssignSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(200),
  riderId: z.string().min(1),
  cost: z.number().nonnegative().optional(),
})

router.post(
  '/bulk-assign',
  requireAuth,
  validateBody(bulkAssignSchema),
  asyncHandler(async (req, res) => {
    const { orderIds, riderId, cost } = req.body as z.infer<typeof bulkAssignSchema>
    const orders = await Promise.all(orderIds.map(id => findOrder(id)))
    const missing = orderIds.filter((_, i) => !orders[i])
    if (missing.length) throw notFound(`orders not found: ${missing.join(',')}`)

    const blocked = orders.filter(o => o!.partnerId && !o!.cost && !cost)
    if (blocked.length) {
      throw unprocessable(
        `${blocked.length} order(s) need pricing before assignment.`,
        { blockedIds: blocked.map(o => o!.id) },
      )
    }

    const results: Order[] = []
    for (const o of orders) {
      const before = { ...o! }
      const updated = await updateOrder(o!.id, {
        assignedTo: riderId,
        assignedAt: new Date().toISOString(),
        status: 'assigned',
        cost: cost ?? o!.cost,
      })
      await logOrderEvent({
        orderId: o!.id,
        type: o!.assignedTo ? 'reassigned' : 'assigned',
        actor: actorFromReq(req),
        before,
        after: updated,
      })
      results.push(updated)
    }
    void sendPushToUser(riderId, {
      title: `${results.length} new deliveries`,
      body: 'You have new assignments — open the rider app.',
      url: '/rider',
    }).catch(() => undefined)
    res.json({ assigned: results.length, orders: results })
  }),
)

const statusSchema = z.object({
  status: z.enum([
    'picked_up',
    'in_transit',
    'delivered',
    'awaiting_confirmation',
    'failed',
    'returned',
    'cancelled',
  ]),
  proof: z
    .object({
      receiverName: z.string().optional(),
      signatureS3Key: z.string().optional(),
      photoS3Key: z.string().optional(),
      gps: z
        .object({
          lat: z.number(),
          lng: z.number(),
          accuracy: z.number().optional(),
          capturedAt: z.string(),
        })
        .optional(),
    })
    .optional(),
  failureReason: z.enum(['recipient_not_home', 'wrong_address', 'refused', 'damaged', 'unreachable', 'other']).optional(),
  failureNote: z.string().optional(),
  codCollected: z.number().nonnegative().optional(),
})

router.put(
  '/:id/status',
  requireAuth,
  validateBody(statusSchema),
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.params.id)
    if (!order) throw notFound('order not found')
    if (req.user!.role === 'rider' && order.assignedTo !== req.user!.riderId) {
      throw forbidden('order not assigned to you')
    }
    const before = { ...order }
    const patch: Partial<Order> = { status: req.body.status }
    if (req.body.status === 'delivered' || req.body.status === 'awaiting_confirmation') {
      patch.deliveredAt = new Date().toISOString()
      if (req.body.proof) {
        patch.proof = {
          receiverName: req.body.proof.receiverName,
          signatureS3Key: req.body.proof.signatureS3Key,
          photoS3Key: req.body.proof.photoS3Key,
          gps: req.body.proof.gps,
          timestamp: new Date().toISOString(),
        }
      }
    }
    if (req.body.status === 'picked_up') patch.pickedUpAt = new Date().toISOString()
    if (req.body.status === 'failed') {
      patch.failedAt = new Date().toISOString()
      patch.failureReason = req.body.failureReason
      patch.failureNote = req.body.failureNote
    }
    if (req.body.codCollected !== undefined) patch.codCollected = req.body.codCollected

    const updated = await updateOrder(order.id, patch)
    await logOrderEvent({
      orderId: order.id,
      type: req.body.status as never,
      actor: actorFromReq(req),
      before,
      after: updated,
      metadata: {
        failureReason: req.body.failureReason,
        codCollected: req.body.codCollected,
      },
    })

    // Customer SMS on delivered
    if (updated.status === 'awaiting_confirmation' && updated.customerPhone) {
      void sendSms(
        updated.customerPhone,
        `Your PullUp delivery ${updated.id} has arrived. Thanks for choosing us.`,
      ).catch(() => undefined)
    }
    res.json(updated)
  }),
)

router.put(
  '/:id/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.params.id)
    if (!order) throw notFound('order not found')
    if (req.user!.role === 'rider') throw forbidden('only managers can confirm')
    const before = { ...order }
    const updated = await updateOrder(order.id, {
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      revenueStatus: order.revenueStatus === 'suspense' ? 'receivable' : order.revenueStatus,
    })
    await logOrderEvent({
      orderId: order.id,
      type: 'confirmed',
      actor: actorFromReq(req),
      before,
      after: updated,
    })
    if (order.partnerId) {
      void notifyPartner(order, 'confirmed').catch(() => undefined)
    }
    res.json(updated)
  }),
)

router.put(
  '/:id/reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.params.id)
    if (!order) throw notFound('order not found')
    if (req.user!.role === 'rider') throw forbidden('only managers can reject')
    const before = { ...order }
    const updated = await updateOrder(order.id, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
    })
    await logOrderEvent({ orderId: order.id, type: 'rejected', actor: actorFromReq(req), before, after: updated })
    if (order.partnerId) void notifyPartner(order, 'rejected').catch(() => undefined)
    res.json(updated)
  }),
)

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.params.id)
    if (!order) throw notFound('order not found')
    if (req.user!.role === 'rider') throw forbidden()
    await softDeleteOrder(order.id)
    await logOrderEvent({ orderId: order.id, type: 'cancelled', actor: actorFromReq(req), before: order })
    res.json({ ok: true })
  }),
)

// Presigned S3 upload URL for proof-of-delivery
router.post(
  '/:id/upload-url',
  requireAuth,
  validateBody(
    z.object({
      kind: z.enum(['signature', 'photo']),
      contentType: z.string().min(1),
      contentLength: z.number().int().positive(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.params.id)
    if (!order) throw notFound('order not found')
    const presign = await presignUpload({
      kind: req.body.kind,
      orderId: order.id,
      contentType: req.body.contentType,
      contentLength: req.body.contentLength,
    })
    res.json(presign)
  }),
)

// CSV import
router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = (req as unknown as { file?: Express.Multer.File }).file
    if (!file) throw badRequest('No file uploaded')
    const user = req.user!
    const branchId = user.branchId ?? 'default'
    const records = parse(file.buffer, { columns: true, skip_empty_lines: true, trim: true }) as Array<Record<string, string>>
    let imported = 0
    for (const row of records) {
      const order = await createOrder({
        branchId,
        status: (row.status as never) ?? 'pending',
        priority: 'normal',
        paymentMethod: 'prepaid',
        customerName: row.customer ?? row.customerName ?? 'Unknown',
        customerPhone: row.phone,
        destination: row.destination ?? row.address ?? '',
        destinationZone: row.zone,
        cost: row.cost ? Number(row.cost) : undefined,
        createdBy: user.sub,
      } as never)
      await logOrderEvent({
        orderId: order.id,
        type: 'imported',
        actor: actorFromReq(req),
        after: order,
        metadata: { via: 'csv' },
      })
      imported++
    }
    res.json({ imported })
  }),
)

// CSV export
router.get(
  '/export.csv',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    const { items } = await listOrders({ branchId, limit: 200 })
    const header = ['id', 'status', 'customer', 'phone', 'destination', 'zone', 'cost', 'assignedTo', 'createdAt']
    const rows = items.map(o =>
      [
        o.id,
        o.status,
        o.customerName,
        o.customerPhone ?? '',
        o.destination,
        o.destinationZone ?? '',
        o.cost ?? '',
        o.assignedTo ?? '',
        o.createdAt,
      ]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    res.type('text/csv').send([header.join(','), ...rows].join('\n'))
  }),
)

// Rare hard-delete for super-admin
router.delete(
  '/:id/hard',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'super-admin') throw forbidden()
    await hardDeleteOrder(req.params.id)
    res.json({ ok: true })
  }),
)

export default router
