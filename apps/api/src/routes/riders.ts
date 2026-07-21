import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { requireAuth, requireRole } from '../middleware/access'
import { getBranchFilter } from '../middleware/branchScope'
import {
  createRider,
  findRider,
  listRiders,
  softDeleteRider,
  updateRider,
} from '../repos/riders'
import { newId, nowIso } from '../lib/ids'
import { notFound } from '../lib/errors'
import { listOrders } from '../repos/orders'
import { addEmailToRidersGroup, removeEmailFromRidersGroup } from '../services/accessGroups'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

// ── List all riders (with order counts) ────────────────────────────
app.get('/', requireAuth(), async c => {
  const b = getBranchFilter(c)
  const riders = await listRiders(c.env, b === '__ALL__' ? undefined : b)

  // Attach order counts per rider
  const { items: allOrders } = await listOrders(c.env, {
    branchId: b === '__ALL__' ? undefined : b,
    limit: 500,
  })

  const counts: Record<string, { active: number; delivered: number; total: number }> = {}
  const activeStatuses = new Set(['assigned', 'picked_up', 'in_transit', 'awaiting_confirmation'])
  for (const o of allOrders) {
    if (!o.assignedTo) continue
    if (!counts[o.assignedTo]) counts[o.assignedTo] = { active: 0, delivered: 0, total: 0 }
    counts[o.assignedTo].total++
    if (activeStatuses.has(o.status)) counts[o.assignedTo].active++
    if (o.status === 'confirmed' || o.status === 'delivered') counts[o.assignedTo].delivered++
  }

  return c.json({
    items: riders.map(r => ({
      ...r,
      orderCounts: counts[r.id] ?? { active: 0, delivered: 0, total: 0 },
    })),
  })
})

// ── Get one rider ────────────────────────────────────────────────────
app.get('/:id', requireAuth(), async c => {
  const r = await findRider(c.env, c.req.param('id'))
  if (!r) throw notFound('rider not found')
  return c.json(r)
})

// ── Get a rider's active orders ──────────────────────────────────────
app.get('/:id/orders', requireAuth(), async c => {
  const r = await findRider(c.env, c.req.param('id'))
  if (!r) throw notFound('rider not found')
  const { items } = await listOrders(c.env, { riderId: r.id, limit: 100 })
  return c.json({ items })
})

const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email(), // used for Cloudflare Access + D1 user link
  zone: z.string().min(1),
  status: z.enum(['active', 'inactive', 'on_delivery']).default('active'),
  vehicleId: z.string().optional(),
  ratePerDelivery: z.number().nonnegative().optional(),
  ratePctOfFee: z.number().min(0).max(100).optional(),
})

/**
 * Create a rider and fully provision them:
 * 1. Insert row in `riders` table
 * 2. Upsert a row in `users` table (role=rider, rider_id linked)
 * 3. Add their email to the Cloudflare Access pullup-riders group
 */
app.post('/', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const body = createSchema.parse(await c.req.json())
  const user = c.get('user')!
  const branchId = user.branchId ?? 'default'
  const email = body.email.toLowerCase()

  // 1. Create rider row
  const rider = await createRider(c.env, {
    name: body.name,
    phone: body.phone,
    email,
    zone: body.zone,
    status: body.status,
    branchId,
    managerId: user.sub,
    vehicleId: body.vehicleId,
    ratePerDelivery: body.ratePerDelivery,
    ratePctOfFee: body.ratePctOfFee,
  } as never)

  // 2. Upsert user row — find by email or create new
  const existingUser = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
  )
    .bind(email)
    .first<{ id: string }>()

  if (existingUser) {
    // Link existing user to the new rider
    await c.env.DB.prepare(
      'UPDATE users SET rider_id = ?, role = ?, branch_id = ?, status = ?, updated_at = ? WHERE id = ?',
    )
      .bind(rider.id, 'rider', branchId, 'active', nowIso(), existingUser.id)
      .run()
  } else {
    // Create a new user shell — they'll get it populated on first sign-in
    const userId = newId('usr')
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, name, role, status, branch_id, rider_id, created_at, updated_at)
       VALUES (?, ?, ?, 'rider', 'active', ?, ?, ?, ?)`,
    )
      .bind(userId, email, body.name, branchId, rider.id, nowIso(), nowIso())
      .run()
  }

  // 3. Add email to Cloudflare Access riders group
  const accessResult = await addEmailToRidersGroup(c.env, email)

  return c.json({
    rider,
    accessGroupUpdated: accessResult.ok,
    accessGroupSkipped: accessResult.skipped ?? false,
    message: accessResult.ok
      ? `${body.name} can now sign into pulluprider.aegisassetllc.com`
      : `Rider created but Access group update failed — add ${email} to pullup-riders group manually`,
  }, 201)
})

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(6).optional(),
  zone: z.string().optional(),
  status: z.enum(['active', 'inactive', 'on_delivery']).optional(),
  vehicleId: z.string().optional(),
  ratePerDelivery: z.number().nonnegative().optional(),
  ratePctOfFee: z.number().min(0).max(100).optional(),
})

app.put('/:id', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const body = updateSchema.parse(await c.req.json())
  const r = await updateRider(c.env, c.req.param('id'), body)
  if (!r) throw notFound('rider not found')

  // If deactivating, update user status too
  if (body.status === 'inactive') {
    await c.env.DB.prepare(
      "UPDATE users SET status = 'inactive', updated_at = ? WHERE rider_id = ?",
    )
      .bind(nowIso(), c.req.param('id'))
      .run()
  } else if (body.status === 'active') {
    await c.env.DB.prepare(
      "UPDATE users SET status = 'active', updated_at = ? WHERE rider_id = ?",
    )
      .bind(nowIso(), c.req.param('id'))
      .run()
  }

  return c.json(r)
})

// ── Deactivate (soft) ────────────────────────────────────────────────
app.post('/:id/deactivate', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const rider = await findRider(c.env, c.req.param('id'))
  if (!rider) throw notFound('rider not found')

  await softDeleteRider(c.env, rider.id)

  // Deactivate the linked user account
  await c.env.DB.prepare(
    "UPDATE users SET status = 'inactive', updated_at = ? WHERE rider_id = ?",
  )
    .bind(nowIso(), rider.id)
    .run()

  // Remove from Cloudflare Access riders group if email known
  let accessResult: { ok: boolean; skipped: boolean } = { ok: true, skipped: true }
  if (rider.email) {
    accessResult = await removeEmailFromRidersGroup(c.env, rider.email)
  }

  return c.json({
    ok: true,
    accessGroupUpdated: accessResult.ok,
    message: `${rider.name} deactivated and cannot sign into the rider app`,
  })
})

// ── Reactivate ───────────────────────────────────────────────────────
app.post('/:id/activate', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const rider = await findRider(c.env, c.req.param('id'))
  if (!rider) throw notFound('rider not found')

  await updateRider(c.env, rider.id, { status: 'active' } as never)

  await c.env.DB.prepare(
    "UPDATE users SET status = 'active', deleted_at = NULL, updated_at = ? WHERE rider_id = ?",
  )
    .bind(nowIso(), rider.id)
    .run()

  let accessResult: { ok: boolean; skipped: boolean } = { ok: true, skipped: true }
  if (rider.email) {
    accessResult = await addEmailToRidersGroup(c.env, rider.email)
  }

  return c.json({
    ok: true,
    accessGroupUpdated: accessResult.ok,
    message: `${rider.name} reactivated — they can sign into pulluprider.aegisassetllc.com`,
  })
})

export default app
