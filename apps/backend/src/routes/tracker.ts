import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler, validateBody } from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { trackerLimiter } from '../middleware/rateLimit.js'
import {
  buildTrackerUrl,
  signTrackerToken,
  verifyTrackerToken,
} from '../services/trackerLink.js'
import { findOrder } from '../data/ordersRepo.js'
import { sendEmail, renderTemplate } from '../services/notifications/email.js'
import { sendSms } from '../services/notifications/sms.js'
import { sendWhatsApp } from '../services/notifications/whatsapp.js'
import { env } from '../config/env.js'
import { badRequest, gone, notFound } from '../lib/errors.js'
import { logger } from '../lib/logger.js'

const router = Router()

router.post(
  '/generate',
  requireAuth,
  trackerLimiter,
  validateBody(
    z.object({
      orderId: z.string().min(1),
      bikeId: z.string().min(1),
      logoUrl: z.string().url().optional(),
      expiresInSeconds: z.number().int().positive().max(7 * 24 * 3600).default(3600),
    }),
  ),
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.body.orderId)
    if (!order) throw notFound('order not found')
    const token = signTrackerToken(
      { bikeId: req.body.bikeId, orderId: req.body.orderId, logoUrl: req.body.logoUrl },
      req.body.expiresInSeconds,
    )
    res.json({
      trackingUrl: buildTrackerUrl(token),
      token,
      expiresInSeconds: req.body.expiresInSeconds,
    })
  }),
)

router.post(
  '/send',
  requireAuth,
  trackerLimiter,
  validateBody(
    z.object({
      orderId: z.string().min(1),
      bikeId: z.string().min(1),
      channel: z.enum(['email', 'sms', 'whatsapp']),
      to: z.string().min(1),
      logoUrl: z.string().url().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const order = await findOrder(req.body.orderId)
    if (!order) throw notFound('order not found')
    const token = signTrackerToken(
      { bikeId: req.body.bikeId, orderId: req.body.orderId, logoUrl: req.body.logoUrl },
      24 * 3600,
    )
    const url = buildTrackerUrl(token)

    if (req.body.channel === 'email') {
      const html = renderTemplate('tracker_email', {
        trackingUrl: url,
        orderId: order.id,
        logoUrl: req.body.logoUrl ?? '',
        customerName: order.customerName,
      })
      const result = await sendEmail({
        to: req.body.to,
        subject: `Track your delivery — order ${order.id}`,
        html,
      })
      if (result.skipped) throw badRequest('email delivery not configured')
      return res.json({ ok: true, channel: 'email', messageId: result.messageId })
    }
    if (req.body.channel === 'sms') {
      const result = await sendSms(
        req.body.to,
        `Your PullUp delivery is on the way. Track it: ${url}`,
      )
      if (result.skipped) throw badRequest('sms delivery not configured')
      return res.json({ ok: true, channel: 'sms' })
    }
    if (req.body.channel === 'whatsapp') {
      const result = await sendWhatsApp(
        req.body.to,
        `Your PullUp delivery is on the way. Track it: ${url}`,
      )
      if (result.skipped) throw badRequest('whatsapp delivery not configured')
      return res.json({ ok: true, channel: 'whatsapp' })
    }
    throw badRequest('unknown channel')
  }),
)

// Public — used by /track page
router.post(
  '/validate',
  trackerLimiter,
  validateBody(z.object({ token: z.string().min(10) })),
  asyncHandler(async (req, res) => {
    try {
      const payload = verifyTrackerToken(req.body.token)
      const order = await findOrder(payload.orderId)
      if (!order) throw notFound('order not found')
      if (['confirmed', 'delivered', 'rejected'].includes(order.status)) {
        throw gone('tracking link expired — delivery complete')
      }
      res.json({
        ok: true,
        orderId: order.id,
        orderStatus: order.status,
        bikeId: payload.bikeId,
        logoUrl: payload.logoUrl,
      })
    } catch (err) {
      if ((err as Error).name === 'TokenExpiredError' || (err as Error).name === 'JsonWebTokenError') {
        throw badRequest('invalid or expired tracking token')
      }
      throw err
    }
  }),
)

// Public — location proxy
router.get(
  '/proxy',
  trackerLimiter,
  asyncHandler(async (req, res) => {
    const deviceId = req.query.deviceId as string | undefined
    if (!deviceId) throw badRequest('deviceId required')
    if (!env.TRACKER_API_URL) {
      return res.json({ lat: -1.2921, lng: 36.8219, speed: 0, note: 'tracker api not configured' })
    }
    try {
      const url = `${env.TRACKER_API_URL}?deviceId=${encodeURIComponent(deviceId)}`
      const headers: Record<string, string> = {}
      if (env.TRACKER_API_KEY) headers.Authorization = `Bearer ${env.TRACKER_API_KEY}`
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(5_000) })
      if (!r.ok) return res.json({ lat: -1.2921, lng: 36.8219, speed: 0 })
      const body = await r.json()
      res.json(body)
    } catch (err) {
      logger.warn({ err }, 'tracker proxy failed')
      res.json({ lat: -1.2921, lng: 36.8219, speed: 0 })
    }
  }),
)

export default router
