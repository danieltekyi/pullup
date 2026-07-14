import type { Env } from '../env'
import type { Partner } from '@pullup/shared'
import { findByPartnerRef, createOrder } from '../repos/orders'
import { logOrderEvent } from '../repos/orderEvents'
import { listPartners, updatePartner, findPartner } from '../repos/partners'

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

export async function fetchFromPartner(env: Env, partner: Partner): Promise<{ imported: number; skipped: number }> {
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
    const partnerOrderId = String(pick(row, 'id', 'orderId', 'order_id', 'deliveryId') ?? `${Date.now()}_${imported}`)
    const existing = await findByPartnerRef(env, partner.id, partnerOrderId)
    if (existing) { skipped++; continue }

    const rawFee = pick(row, 'deliveryFee', 'delivery_fee', 'cost', 'amount', 'fee', 'price')
    const fee = rawFee !== undefined ? Number(rawFee) : undefined
    const hasFee = fee !== undefined && !isNaN(fee) && fee > 0

    const order = await createOrder(env, {
      branchId: partner.branchId ?? 'default',
      status: 'pending',
      priority: 'normal',
      paymentMethod: 'prepaid',
      customerName: String(pick(row, 'customer', 'customerName', 'customer_name', 'recipient', 'name') ?? 'Unknown'),
      customerPhone: (pick(row, 'phone', 'customerPhone', 'customer_phone', 'msisdn') as string | undefined) ?? undefined,
      destination: String(pick(row, 'destination', 'address', 'deliveryAddress', 'dropoff') ?? ''),
      destinationZone: pick(row, 'zone', 'destinationZone') as string | undefined,
      cost: hasFee ? fee : undefined,
      deliveryFeeFromPartner: hasFee ? fee : undefined,
      revenueStatus: hasFee ? 'suspense' : 'none',
      partnerId: partner.id,
      partnerOrderId,
    })

    await logOrderEvent(env, {
      orderId: order.id,
      type: 'imported',
      actor: { sub: 'system', role: 'super-admin' },
      after: order,
      metadata: { partnerId: partner.id, partnerOrderId },
    })
    imported++
  }
  await updatePartner(env, partner.id, { lastFetchedAt: new Date().toISOString() })
  return { imported, skipped }
}

export async function fetchAllActivePartners(env: Env): Promise<Record<string, { imported: number; skipped: number; error?: string }>> {
  const partners = await listPartners(env)
  const report: Record<string, { imported: number; skipped: number; error?: string }> = {}
  for (const partner of partners.filter(p => p.active)) {
    try {
      report[partner.id] = await fetchFromPartner(env, partner)
    } catch (err) {
      report[partner.id] = { imported: 0, skipped: 0, error: (err as Error).message }
    }
  }
  return report
}

export async function notifyPartner(env: Env, order: { partnerId?: string; partnerOrderId?: string }, status: string): Promise<void> {
  if (!order.partnerId || !order.partnerOrderId) return
  const partner = await findPartner(env, order.partnerId)
  if (!partner?.putUrlTemplate) return
  const url = partner.putUrlTemplate.replace('{orderId}', order.partnerOrderId)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (partner.apiKey) headers['x-api-key'] = partner.apiKey
  try {
    await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ status, updatedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    console.warn('partner PUT failed', (err as Error).message)
  }
}
