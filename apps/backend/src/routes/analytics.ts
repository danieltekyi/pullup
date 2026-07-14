import { Router } from 'express'
import { asyncHandler } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { getBranchFilter } from '../middleware/branchScope.js'
import { listOrders } from '../data/ordersRepo.js'
import { listRiders } from '../data/ridersRepo.js'
import { getFinanceSummary } from '../data/financeRepo.js'

const router = Router()

router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    const [orders, riders, finance] = await Promise.all([
      listOrders({ branchId, limit: 200 }),
      listRiders(branchId),
      getFinanceSummary(branchId),
    ])
    const activeStatuses = new Set(['pending', 'assigned', 'picked_up', 'in_transit', 'awaiting_confirmation'])
    res.json({
      totalOrders: orders.items.length,
      pendingOrders: orders.items.filter(o => o.status === 'pending').length,
      assignedOrders: orders.items.filter(o => o.status === 'assigned').length,
      deliveredOrders: orders.items.filter(o => o.status === 'confirmed' || o.status === 'delivered').length,
      inFlightOrders: orders.items.filter(o => activeStatuses.has(o.status)).length,
      totalRiders: riders.length,
      activeRiders: riders.filter(r => r.status === 'active').length,
      totalRevenue: finance.totalRevenue,
      totalExpenditures: finance.totalExpenditures,
      netRevenue: finance.netRevenue,
      codOutstanding: finance.codOutstanding,
    })
  }),
)

router.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    const period = (req.query.period as string) || 'daily'
    const { items } = await listOrders({ branchId, limit: 200 })
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
    res.json(
      Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, data]) => ({ label, ...data })),
    )
  }),
)

router.get(
  '/riders/performance',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    const [orders, riders] = await Promise.all([listOrders({ branchId, limit: 200 }), listRiders(branchId)])
    const byRider: Record<string, { rider: string; delivered: number; failed: number; avgMinutes: number; revenue: number }> = {}
    for (const r of riders) byRider[r.id] = { rider: r.name, delivered: 0, failed: 0, avgMinutes: 0, revenue: 0 }
    const totals: Record<string, number> = {}
    for (const o of orders.items) {
      if (!o.assignedTo || !byRider[o.assignedTo]) continue
      const entry = byRider[o.assignedTo]
      if (o.status === 'confirmed' || o.status === 'delivered') {
        entry.delivered++
        entry.revenue += o.cost ?? 0
        if (o.assignedAt && o.deliveredAt) {
          const mins = (new Date(o.deliveredAt).getTime() - new Date(o.assignedAt).getTime()) / 60_000
          totals[o.assignedTo] = (totals[o.assignedTo] ?? 0) + mins
        }
      } else if (o.status === 'failed' || o.status === 'rejected') {
        entry.failed++
      }
    }
    for (const [id, mins] of Object.entries(totals)) {
      if (byRider[id].delivered > 0) byRider[id].avgMinutes = Math.round(mins / byRider[id].delivered)
    }
    res.json(Object.values(byRider))
  }),
)

export default router
