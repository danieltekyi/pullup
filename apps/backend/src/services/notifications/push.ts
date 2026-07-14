import webpush from 'web-push'
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { listPushSubs, unsubscribePush } from '../../data/pushSubsRepo.js'

let configured = false
function ensureConfigured() {
  if (configured) return true
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  data?: Record<string, unknown>
}

/**
 * Sends a Web Push notification to every registered device for `userId`.
 * Invalid subscriptions (410 Gone) are pruned automatically.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) {
    logger.warn({ userId }, 'VAPID not configured — push skipped')
    return { sent: 0, pruned: 0 }
  }
  const subs = await listPushSubs(userId)
  let sent = 0
  let pruned = 0
  await Promise.all(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
          { TTL: 60 * 60 },
        )
        sent++
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await unsubscribePush(userId, sub.endpoint)
          pruned++
        } else {
          logger.warn({ err, endpoint: sub.endpoint }, 'push send failed')
        }
      }
    }),
  )
  return { sent, pruned }
}

export function vapidPublicKey(): string | undefined {
  return env.VAPID_PUBLIC_KEY
}
