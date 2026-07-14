import { listPartners, updatePartner } from '../data/partnersRepo.js'
import { findOrderByPartnerRef, createOrder } from '../data/ordersRepo.js'
import { logger } from '../lib/logger.js'
import type { Partner } from '@pullup/shared'
import { logOrderEvent } from '../data/orderEventsRepo.js'

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

export async function fetchFromPartner(partner: Partner): Promise<{ imported: number; skipped: number }> {
  const url = partner.getUrl
  if (!url) throw new Error(`Partner ${partner.name} has no GET URL`)

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (partner.apiKey) headers['x-api-key'] = partner.apiKey

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Partner ${partner.name} returned HTTP ${res.status}`)

  const data = (await res.json()) as unknown
  const rows: Record<string, unknown>[] = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : (() => {
        const obj = data as Record<string, unknown>
        for (const k of ['data', 'orders', 'items', 'results']) {
          if (Array.isArray(obj?.[k])) return obj[k] as Record<string, unknown>[]
        }
        return []
      })()

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const partnerOrderId = String(
      pick(row, 'id', 'orderId', 'order_id', 'deliveryId', 'delivery_id') ?? `${Date.now()}_${imported}`,
    )
    const existing = await findOrderByPartnerRef(partner.id, partnerOrderId)
    if (existing) {
      skipped++
      continue
    }

    const rawFee = pick(row, 'deliveryFee', 'delivery_fee', 'cost', 'amount', 'fee', 'price')
    const fee = rawFee !== undefined ? Number(rawFee) : undefined
    const hasFee = fee !== undefined && !isNaN(fee) && fee > 0

    const order = await createOrder({
      branchId: partner.branchId ?? 'default',
      status: 'pending',
      priority: 'normal',
      paymentMethod: 'prepaid',
      customerName: String(pick(row, 'customer', 'customerName', 'customer_name', 'recipient', 'name') ?? 'Unknown'),
      customerPhone: pick(row, 'phone', 'customerPhone', 'customer_phone', 'msisdn') as string | undefined,
      destination: String(pick(row, 'destination', 'address', 'deliveryAddress', 'delivery_address', 'dropoff') ?? ''),
      destinationZone: pick(row, 'zone', 'destinationZone') as string | undefined,
      cost: hasFee ? fee : undefined,
      deliveryFeeFromPartner: hasFee ? fee : undefined,
      revenueStatus: hasFee ? 'suspense' : 'none',
      partnerId: partner.id,
      partnerOrderId,
    } as never)

    await logOrderEvent({
      orderId: order.id,
      type: 'imported',
      actor: { sub: 'system', role: 'super-admin' },
      after: order,
      metadata: { partnerId: partner.id, partnerOrderId },
    })

    imported++
  }

  await updatePartner(partner.id, { lastFetchedAt: new Date().toISOString() })
  logger.info({ partner: partner.name, imported, skipped }, 'partner fetch complete')
  return { imported, skipped }
}

export async function fetchAllActivePartners(): Promise<Record<string, { imported: number; skipped: number; error?: string }>> {
  const partners = await listPartners()
  const report: Record<string, { imported: number; skipped: number; error?: string }> = {}
  for (const partner of partners.filter(p => p.active)) {
    try {
      report[partner.id] = await fetchFromPartner(partner)
    } catch (err) {
      report[partner.id] = { imported: 0, skipped: 0, error: (err as Error).message }
      logger.warn({ partnerId: partner.id, err }, 'partner fetch failed')
    }
  }
  return report
}

export async function notifyPartner(
  order: { partnerId?: string; partnerOrderId?: string },
  status: string,
): Promise<void> {
  if (!order.partnerId || !order.partnerOrderId) return
  const { findPartner } = await import('../data/partnersRepo.js')
  const partner = await findPartner(order.partnerId)
  if (!partner?.putUrlTemplate) return

  const url = partner.putUrlTemplate.replace('{orderId}', order.partnerOrderId)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (partner.apiKey) headers['x-api-key'] = partner.apiKey

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status, updatedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    })
    logger.info({ partnerId: partner.id, status: res.status }, 'partner PUT sent')
  } catch (err) {
    logger.warn({ err, partnerId: partner.id }, 'partner PUT failed')
  }
}
