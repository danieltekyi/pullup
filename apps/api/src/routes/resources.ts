import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { requireAuth, requireRole } from '../middleware/access'
import { getBranchFilter } from '../middleware/branchScope'
import { createVehicle, findVehicle, listVehicles, softDeleteVehicle, updateVehicle } from '../repos/vehicles'
import { createPartner, deletePartner, findPartner, listPartners, updatePartner } from '../repos/partners'
import { listCustomers, findCustomer } from '../repos/customers'
import { fetchFromPartner } from '../services/partnerFetch'
import { notFound } from '../lib/errors'
import { createExpenditure, financeSummary, listExpenditures, softDeleteExpenditure } from '../repos/finance'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

// -------- fleet (vehicles) --------
app.get('/fleet', requireAuth(), async c => {
  const b = getBranchFilter(c)
  return c.json({ items: await listVehicles(c.env, b === '__ALL__' ? undefined : b) })
})
app.get('/fleet/:id', requireAuth(), async c => {
  const v = await findVehicle(c.env, c.req.param('id'))
  if (!v) throw notFound()
  return c.json(v)
})
const vehSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  registration: z.string().min(1),
  status: z.enum(['available', 'in_use', 'maintenance', 'retired']).default('available'),
  trackerConfig: z.object({ deviceId: z.string().optional(), provider: z.string().optional() }).optional(),
  insuranceExpiry: z.string().optional(),
  licenseExpiry: z.string().optional(),
  odometerKm: z.number().nonnegative().optional(),
})
app.post('/fleet', requireAuth(), async c => {
  const body = vehSchema.parse(await c.req.json())
  const user = c.get('user')!
  return c.json(await createVehicle(c.env, { ...body, branchId: user.branchId ?? 'default' }), 201)
})
app.put('/fleet/:id', requireAuth(), async c => {
  const body = vehSchema.partial().parse(await c.req.json())
  const v = await updateVehicle(c.env, c.req.param('id'), body)
  if (!v) throw notFound()
  return c.json(v)
})
app.delete('/fleet/:id', requireAuth(), async c => {
  await softDeleteVehicle(c.env, c.req.param('id'))
  return c.json({ ok: true })
})

// -------- partners --------
app.get('/partners', requireAuth(), async c => c.json({ items: await listPartners(c.env) }))
const partnerSchema = z.object({
  name: z.string().min(1),
  getUrl: z.string().url().optional(),
  putUrlTemplate: z.string().optional(),
  apiKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  active: z.boolean().default(true),
  branchId: z.string().optional(),
})
app.post('/partners', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const body = partnerSchema.parse(await c.req.json())
  return c.json(await createPartner(c.env, body), 201)
})
app.put('/partners/:id', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const body = partnerSchema.partial().parse(await c.req.json())
  const p = await updatePartner(c.env, c.req.param('id'), body)
  if (!p) throw notFound()
  return c.json(p)
})
app.delete('/partners/:id', requireAuth(), requireRole('super-admin'), async c => {
  await deletePartner(c.env, c.req.param('id'))
  return c.json({ ok: true })
})
app.post('/partners/:id/fetch', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const p = await findPartner(c.env, c.req.param('id'))
  if (!p) throw notFound()
  return c.json(await fetchFromPartner(c.env, p))
})

// -------- finance --------
app.get('/finance/expenditures', requireAuth(), async c => {
  const b = getBranchFilter(c)
  return c.json({
    items: await listExpenditures(c.env, b === '__ALL__' ? undefined : b, c.req.query('from'), c.req.query('to')),
  })
})
app.post('/finance/expenditures', requireAuth(), async c => {
  const body = z.object({
    category: z.enum(['fuel', 'maintenance', 'salary', 'rent', 'utility', 'other']),
    description: z.string().min(1),
    amount: z.number().positive(),
    date: z.string(),
    vehicleId: z.string().optional(),
    riderId: z.string().optional(),
  }).parse(await c.req.json())
  const user = c.get('user')!
  return c.json(await createExpenditure(c.env, { ...body, branchId: user.branchId ?? 'default', createdBy: user.sub }), 201)
})
app.delete('/finance/expenditures/:id', requireAuth(), async c => {
  const ok = await softDeleteExpenditure(c.env, c.req.param('id'))
  if (!ok) throw notFound()
  return c.json({ ok: true })
})
app.get('/finance/report', requireAuth(), async c => {
  const b = getBranchFilter(c)
  return c.json(await financeSummary(c.env, b === '__ALL__' ? undefined : b, c.req.query('from'), c.req.query('to')))
})

// -------- customers --------
app.get('/customers', requireAuth(), async c => {
  const b = getBranchFilter(c)
  return c.json({ items: await listCustomers(c.env, b === '__ALL__' ? undefined : b) })
})
app.get('/customers/:id', requireAuth(), async c => {
  const cust = await findCustomer(c.env, c.req.param('id'))
  if (!cust) throw notFound()
  return c.json(cust)
})

export default app
