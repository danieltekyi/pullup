import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'

/**
 * M-Pesa Daraja B2C payout to a rider's phone number. Configure MPESA_* env vars.
 * This is a scaffold — production usage needs whitelisted callbacks, transaction
 * logging, and reconciliation. Do NOT enable in production without a security
 * review.
 */
export async function payoutRider(params: {
  phone: string
  amount: number
  reference: string
  remarks?: string
}): Promise<{ ok: boolean; skipped?: boolean; conversationId?: string }> {
  if (!env.MPESA_CONSUMER_KEY || !env.MPESA_CONSUMER_SECRET || !env.MPESA_SHORTCODE || !env.MPESA_PASSKEY) {
    logger.warn({ phone: params.phone }, 'M-Pesa not configured — payout skipped')
    return { ok: false, skipped: true }
  }
  // NB: this method is intentionally a stub. Filling in the OAuth + B2C endpoints
  // requires the merchant to be onboarded with Safaricom and to whitelist a callback URL.
  logger.info({ params }, 'M-Pesa payout requested (stub)')
  return { ok: true, conversationId: `stub_${Date.now()}` }
}
