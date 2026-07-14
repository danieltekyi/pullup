import { Router } from 'express'
import { asyncHandler } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { getBranchFilter } from '../middleware/branchScope.js'
import { listCustomers, findCustomer } from '../data/customersRepo.js'
import { notFound } from '../lib/errors.js'

const router = Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const branchId = getBranchFilter(req)
    res.json({ items: await listCustomers(branchId) })
  }),
)

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const c = await findCustomer(req.params.id)
    if (!c) throw notFound('customer not found')
    res.json(c)
  }),
)

export default router
