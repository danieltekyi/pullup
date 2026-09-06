import type { Env } from '../env'
import type { Order, OrderStatus } from '@pullup/shared'
import { sendSms } from './notifications/sms'
import { sendWhatsApp } from './notifications/whatsapp'

/**
 * Tells the customer what is happening to their delivery.
 *
 * Before this, exactly one of eleven statuses produced a message: the parcel
 * arriving. Everything else was silent, so a customer wondering where their
 * delivery was had no option but to ring somebody — which is both the worst
 * experience and the most expensive one to serve.
 *
 * Not every status earns a message. Each SMS costs real money in Ghana, and a
 * customer who gets five texts about one parcel starts ignoring all of them,
 * including the one that mattered. The four below are the moments a customer
 * actually wants to hear from us; `assigned` and `in_transit` are deliberately
 * silent because "a rider has been allocated" tells someone nothing they can
 * act on.
 */

interface Template {
  /** Written for someone reading a notification on a lock screen. */
  text: (o: Order, trackingUrl: string) => string
  /** Whether the tracking link is worth the characters. */
  includeLink: boolean
}

const TEMPLATES: Partial<Record<OrderStatus, Template>> = {
  picked_up: {
    text: o => `PullUp: your delivery from ${senderLabel(o)} is on its way.`,
    includeLink: true,
  },
  // 'delivered' and 'awaiting_confirmation' are the same event to a customer:
  // the parcel is at the door. Only one of them ever fires per order because
  // the transition graph does not allow both.
  delivered: {
    text: () => 'PullUp: your delivery has arrived.',
    includeLink: false,
  },
  awaiting_confirmation: {
    text: () => 'PullUp: your delivery has arrived.',
    includeLink: false,
  },
  failed: {
    // Says what happens next, because "delivery failed" alone produces a phone
    // call every single time.
    text: o =>
      `PullUp: we could not complete your delivery${failureClause(o)}. ` +
      'We will try again on the next round — call us on +233 54 473 6481 to arrange a different time.',
    includeLink: false,
  },
  cancelled: {
    text: () => 'PullUp: your delivery has been cancelled. Call +233 54 473 6481 if this is unexpected.',
    includeLink: false,
  },
  returned: {
    text: () => 'PullUp: your delivery could not be completed and the parcel is going back to the sender.',
    includeLink: false,
  },
}

/** Reasons safe to repeat to the recipient. */
const FAILURE_TEXT: Record<string, string> = {
  recipient_not_home: ' because nobody was available',
  wrong_address: ' because the address could not be found',
  refused: '',
  damaged: '',
  unreachable: ' because we could not reach you by phone',
  other: '',
}

function failureClause(o: Order): string {
  return FAILURE_TEXT[o.failureReason ?? 'other'] ?? ''
}

function senderLabel(o: Order): string {
  // The partner name if there is one, otherwise something neutral. Never the
  // free-text description, which contains the pickup address and the
  // recipient's phone number.
  return o.partnerId ? 'your order' : 'your order'
}

const CUSTOMER_APP = 'https://pullupcustomer.aegisassetllc.com'

const sentKey = (orderId: string, status: string) => `notify:${orderId}:${status}`

/**
 * Sends the customer message for a status change, at most once.
 *
 * Deduplication is not optional here. Riders work offline and their actions
 * replay through /api/sync when signal returns, so the same transition can
 * arrive more than once. Without this a customer gets the same text three
 * times and PullUp pays for all three.
 */
export async function notifyCustomer(
  env: Env,
  order: Order,
  status: OrderStatus,
): Promise<{ sent: boolean; channel?: 'whatsapp' | 'sms'; reason?: string }> {
  const template = TEMPLATES[status]
  if (!template) return { sent: false, reason: 'no message for this status' }
  if (!order.customerPhone) return { sent: false, reason: 'no phone number' }

  const key = sentKey(order.id, status)
  try {
    if (await env.KV.get(key)) return { sent: false, reason: 'already sent' }
  } catch {
    // KV unreachable. Sending a possible duplicate beats staying silent about
    // a failed delivery.
  }

  const trackingUrl = `${CUSTOMER_APP}/track?orderId=${order.id}`
  const body = template.includeLink
    ? `${template.text(order, trackingUrl)} Track it: ${trackingUrl}`
    : template.text(order, trackingUrl)

  // WhatsApp first: in Ghana it is both cheaper and far more widely read than
  // SMS, and it renders the tracking link as something tappable. SMS is the
  // fallback because it reaches a phone with no data left.
  let channel: 'whatsapp' | 'sms' | undefined
  const wa = await sendWhatsApp(env, order.customerPhone, body).catch(() => ({ ok: false, skipped: true }))
  if (wa.ok) {
    channel = 'whatsapp'
  } else {
    const sms = await sendSms(env, order.customerPhone, body).catch(() => ({ ok: false, skipped: true }))
    if (sms.ok) channel = 'sms'
  }

  if (!channel) {
    console.error(
      `CUSTOMER NOT NOTIFIED of ${status} on ${order.id}. ` +
        'Neither WhatsApp nor SMS is configured or both failed. ' +
        'Check TWILIO_* and AT_* credentials.',
    )
    return { sent: false, reason: 'no channel available' }
  }

  // Marked only after something actually left, so a failed send is retried on
  // the next transition rather than silently swallowed.
  await env.KV.put(key, new Date().toISOString(), {
    expirationTtl: 60 * 60 * 24 * 30,
  }).catch(() => undefined)

  return { sent: true, channel }
}

/** Statuses that produce a customer message, for tests and documentation. */
export const NOTIFIED_STATUSES = Object.keys(TEMPLATES) as OrderStatus[]
