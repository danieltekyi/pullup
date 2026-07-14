import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { requireAuth, requireRole } from '../middleware/access'
import { getBranchFilter } from '../middleware/branchScope'
import { getPermissionsForRole, listUsers, setPermissionsForRole, updateUser } from '../repos/admin'
import { listBranches, findBranch, upsertBranch, deleteZone, listZoneRates, listZones, upsertZone, upsertZoneRate, listParams, upsertParam, subscribePush, unsubscribePush } from '../repos/misc'
import { computePhysicsCost, PHYSICS_DEFAULTS, type PhysicsParams } from '@pullup/shared'
import { forbidden, notFound } from '../lib/errors'
import { listOrders } from '../repos/orders'
import { listRiders } from '../repos/riders'
import { financeSummary } from '../repos/finance'
import { fetchAllActivePartners } from '../services/partnerFetch'
import { vapidPublicKey } from '../services/notifications/push'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

// -------- users --------
app.get('/users/me', async c => {
  const u = c.get('user')
  if (!u) return c.json({ authenticated: false }, 401)
  return c.json(u)
})
app.get('/users', requireAuth(), requireRole('super-admin'), async c =>
  c.json({ items: await listUsers(c.env, c.req.query('branchId')) })
)
app.put('/users/:id', requireAuth(), requireRole('super-admin'), async c => {
  const body = z.object({
    branchId: z.string().optional().nullable(),
    managerId: z.string().optional().nullable(),
    riderId: z.string().optional().nullable(),
    status: z.enum(['active', 'inactive']).optional(),
    name: z.string().optional(),
    role: z.enum(['super-admin', 'manager', 'rider']).optional(),
  }).parse(await c.req.json())
  await updateUser(c.env, c.req.param('id'), body)
  return c.json({ ok: true })
})

// -------- permissions --------
app.get('/permissions', requireAuth(), async c => {
  const u = c.get('user')!
  return c.json(await getPermissionsForRole(c.env, u.role))
})
app.put('/permissions/:role', requireAuth(), requireRole('super-admin'), async c => {
  const role = c.req.param('role') as 'super-admin' | 'manager' | 'rider'
  const body = await c.req.json()
  await setPermissionsForRole(c.env, role, body)
  return c.json({ ok: true })
})

// -------- branches --------
app.get('/branches', requireAuth(), async c => c.json({ items: await listBranches(c.env) }))
app.get('/branches/:id', requireAuth(), async c => {
  const b = await findBranch(c.env, c.req.param('id'))
  if (!b) throw notFound()
  return c.json(b)
})
app.post('/branches', requireAuth(), requireRole('super-admin'), async c => {
  const body = z.object({
    id: z.string(),
    name: z.string(),
    city: z.string(),
    country: z.string(),
    currency: z.enum(['KES', 'GHS', 'USD', 'NGN', 'ZAR']),
    timezone: z.string(),
    active: z.boolean().default(true),
  }).parse(await c.req.json())
  await upsertBranch(c.env, body)
  return c.json(body, 201)
})

// -------- zones --------
app.get('/zones', requireAuth(), async c => {
  const b = getBranchFilter(c)
  return c.json({ items: await listZones(c.env, b === '__ALL__' ? undefined : b) })
})
app.post('/zones', requireAuth(), async c => {
  const body = z.object({
    id: z.string(),
    name: z.string(),
    ord: z.number().int().nonnegative(),
    polygon: z.array(z.object({ lat: z.number(), lng: z.number() })).optional(),
  }).parse(await c.req.json())
  const branchId = c.get('user')!.branchId ?? 'default'
  await upsertZone(c.env, { ...body, branchId })
  return c.json({ ok: true }, 201)
})
app.delete('/zones/:id', requireAuth(), async c => {
  await deleteZone(c.env, c.req.param('id'))
  return c.json({ ok: true })
})
app.get('/zones/rates', requireAuth(), async c => {
  const b = getBranchFilter(c)
  return c.json({ rates: await listZoneRates(c.env, b === '__ALL__' ? undefined : b) })
})
app.put('/zones/rates', requireAuth(), async c => {
  const body = z.object({ rates: z.record(z.string(), z.number()) }).parse(await c.req.json())
  const branchId = c.get('user')!.branchId ?? 'default'
  for (const [k, v] of Object.entries(body.rates)) {
    await upsertZoneRate(c.env, k, branchId, v)
  }
  return c.json({ ok: true })
})

// -------- params --------
app.get('/params', requireAuth(), async c => c.json({ items: await listParams(c.env, c.req.query('category')) }))
app.put('/params', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const body = z.object({
    params: z.array(z.object({ id: z.string(), category: z.string(), key: z.string(), value: z.string(), label: z.string() })),
  }).parse(await c.req.json())
  for (const p of body.params) await upsertParam(c.env, p)
  return c.json({ saved: body.params.length })
})

// -------- physics pricing --------
app.post('/physics-pricing/calculate', requireAuth(), async c => {
  const body = z.object({ weight: z.number().nonnegative(), distance: z.number().nonnegative() }).parse(await c.req.json())
  const raw = await listParams(c.env, 'physics')
  const map: Record<string, number> = {}
  for (const p of raw) {
    const n = parseFloat(p.value)
    if (!isNaN(n)) map[p.key] = n
  }
  const p: PhysicsParams = {
    fuel_price: map.fuel_price ?? PHYSICS_DEFAULTS.fuel_price,
    base_efficiency: map.base_efficiency ?? PHYSICS_DEFAULTS.base_efficiency,
    max_payload: map.max_payload ?? PHYSICS_DEFAULTS.max_payload,
    alpha: map.alpha ?? PHYSICS_DEFAULTS.alpha,
    maintenance_rate_per_km: map.maintenance_rate_per_km ?? PHYSICS_DEFAULTS.maintenance_rate_per_km,
    beta: map.beta ?? PHYSICS_DEFAULTS.beta,
    terrain_factor: map.terrain_factor ?? PHYSICS_DEFAULTS.terrain_factor,
    salary_per_delivery: map.salary_per_delivery ?? PHYSICS_DEFAULTS.salary_per_delivery,
    overhead_per_delivery: map.overhead_per_delivery ?? PHYSICS_DEFAULTS.overhead_per_delivery,
    profit_margin: map.profit_margin ?? PHYSICS_DEFAULTS.profit_margin,
  }
  const breakdown = computePhysicsCost(body.distance, body.weight, p)
  return c.json({ charge: breakdown.charge, breakdown, paramsUsed: p })
})
app.put('/physics-pricing/params', requireAuth(), async c => {
  const user = c.get('user')!
  if (user.role !== 'super-admin' && user.role !== 'manager') throw forbidden()
  const body = z.object({ params: z.array(z.object({ id: z.string(), key: z.string(), value: z.string(), label: z.string().optional() })) }).parse(await c.req.json())
  for (const p of body.params) await upsertParam(c.env, { id: p.id, category: 'physics', key: p.key, value: p.value, label: p.label ?? p.key })
  return c.json({ saved: body.params.length })
})

// -------- analytics --------
app.get('/analytics/summary', requireAuth(), async c => {
  const b = getBranchFilter(c)
  const branchId = b === '__ALL__' ? undefined : b
  const [orders, riders, finance] = await Promise.all([
    listOrders(c.env, { branchId, limit: 200 }),
    listRiders(c.env, branchId),
    financeSummary(c.env, branchId),
  ])
  const active = new Set(['pending', 'assigned', 'picked_up', 'in_transit', 'awaiting_confirmation'])
  return c.json({
    totalOrders: orders.items.length,
    pendingOrders: orders.items.filter(o => o.status === 'pending').length,
    assignedOrders: orders.items.filter(o => o.status === 'assigned').length,
    deliveredOrders: orders.items.filter(o => o.status === 'confirmed' || o.status === 'delivered').length,
    inFlightOrders: orders.items.filter(o => active.has(o.status)).length,
    totalRiders: riders.length,
    activeRiders: riders.filter(r => r.status === 'active').length,
    totalRevenue: finance.totalRevenue,
    totalExpenditures: finance.totalExpenditures,
    netRevenue: finance.netRevenue,
    codOutstanding: finance.codOutstanding,
  })
})
app.get('/analytics/orders', requireAuth(), async c => {
  const b = getBranchFilter(c)
  const period = c.req.query('period') || 'daily'
  const { items } = await listOrders(c.env, { branchId: b === '__ALL__' ? undefined : b, limit: 500 })
  const buckets: Record<string, { count: number; revenue: number }> = {}
  for (const o of items) {
    const d = new Date(o.createdAt)
    let label = d.toISOString().slice(0, 10)
    if (period === 'monthly') label = d.toISOString().slice(0, 7)
    else if (period === 'yearly') label = String(d.getFullYear())
    else if (period === 'weekly') {
      const first = new Date(d.getFullYear(), 0, 1)
      const week = Math.ceil(((d.getTime() - first.getTime()) / 86_400_000 + first.getDay() + 1) / 7)
      label = `W${week}-${d.getFullYear()}`
    }
    buckets[label] = buckets[label] || { count: 0, revenue: 0 }
    buckets[label].count++
    buckets[label].revenue += o.cost ?? 0
  }
  return c.json(Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([label, v]) => ({ label, ...v })))
})

// -------- push notifications --------
app.get('/push/vapid', async c => {
  const key = vapidPublicKey(c.env)
  if (!key) return c.json({ error: 'vapid not configured' }, 503)
  return c.json({ publicKey: key })
})
app.post('/push/subscribe', requireAuth(), async c => {
  const body = z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }).parse(await c.req.json())
  await subscribePush(c.env, c.get('user')!.id, body.endpoint, body.keys.p256dh, body.keys.auth)
  return c.json({ ok: true })
})
app.post('/push/unsubscribe', requireAuth(), async c => {
  const body = z.object({ endpoint: z.string().url() }).parse(await c.req.json())
  await unsubscribePush(c.env, c.get('user')!.id, body.endpoint)
  return c.json({ ok: true })
})

// -------- proof (R2) --------
app.get('/proofs/:key{.+}', requireAuth(), async c => {
  const key = decodeURIComponent(c.req.param('key'))
  const obj = await c.env.PROOF_BUCKET.get(key)
  if (!obj) throw notFound()
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

// -------- scheduled: partner poll (called from Worker cron) --------
export async function scheduledPartnerFetch(env: Env) {
  return fetchAllActivePartners(env)
}

export default app
