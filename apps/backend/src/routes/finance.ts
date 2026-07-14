import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { getBranchFilter } from '../middleware/branchScope.js'
import {
  createExpenditure,
  getFinanceSummary,
  listExpenditures,
  softDeleteExpenditure,
} from '../data/financeRepo.js'
import { notFound } from '../lib/errors.js'

const router = Router()

router.get(
  '/expenditures',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    res.json({
      items: await listExpenditures(branchId, req.query.from as string, req.query.to as string),
    })
  }),
)

const expSchema = z.object({
  category: z.enum(['fuel', 'maintenance', 'salary', 'rent', 'utility', 'other']),
  description: z.string().min(1),
  amount: z.number().positive(),
  date: z.string(),
  vehicleId: z.string().optional(),
  riderId: z.string().optional(),
})

router.post(
  '/expenditures',
  requireAuth,
  validateBody(expSchema),
  asyncHandler(async (req, res) => {
    const user = req.user!
    const exp = await createExpenditure({
      ...(req.body as z.infer<typeof expSchema>),
      branchId: user.branchId ?? 'default',
      createdBy: user.sub,
    } as never)
    res.status(201).json(exp)
  }),
)

router.delete(
  '/expenditures/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ok = await softDeleteExpenditure(req.params.id)
    if (!ok) throw notFound('expenditure not found')
    res.json({ ok: true })
  }),
)

router.get(
  '/report',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    res.json(await getFinanceSummary(branchId, req.query.from as string, req.query.to as string))
  }),
)

export default router
