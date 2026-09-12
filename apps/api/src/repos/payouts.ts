import type { Env } from '../env'
import { rowToObj } from '../lib/db'

/**
 * What each rider is owed, and what cash is still out.
 *
 * riders.rate_per_delivery and rate_pct_of_fee have been stored since the
 * schema was written and nothing ever computed against them, so paying riders
 * meant somebody adding up deliveries by hand. That is both slow and the sort
 * of arithmetic people quietly get wrong in their own favour or the company's.
 *
 * The owner-operator change makes this sharper. A rider funding their own fuel
 * needs to be paid accurately and on time, or they take work elsewhere.
 */

export interface RiderPayout {
  riderId: string
  riderName: string
  riderPhone: string
  deliveries: number
  /** Sum of delivery fees on the orders counted. */
  grossFees: number
  /** deliveries × rate_per_delivery */
  perDeliveryPay: number
  /** grossFees × rate_pct_of_fee */
  sharePay: number
  /** What to pay them. */
  totalPay: number
  /** Cash they took from customers and have not yet handed over. */
  codHeld: number
  /**
   * What actually changes hands. Negative means the rider owes PullUp, which
   * happens when they collected more cash than their pay comes to — common on
   * a COD-heavy round and the single easiest thing to get wrong by hand.
   */
  netToRider: number
  ratePerDelivery: number
  ratePctOfFee: number
}

/**
 * Payouts for a period.
 *
 * Counts orders by delivered_at rather than created_at: a rider is paid for
 * the work they did in the week, not for orders that happened to be raised in
 * it. Confirmed and delivered both count — waiting on a manager's click is not
 * the rider's problem.
 */
export async function riderPayouts(
  env: Env,
  from: string,
  to: string,
  branchId?: string,
): Promise<{ from: string; to: string; payouts: RiderPayout[]; totals: { deliveries: number; pay: number; codHeld: number } }> {
  const where = branchId ? 'AND r.branch_id = ?' : ''
  const binds: unknown[] = [from, to]
  if (branchId) binds.push(branchId)

  const res = await env.DB.prepare(
    `SELECT r.id                AS rider_id,
            r.name              AS rider_name,
            r.phone             AS rider_phone,
            COALESCE(r.rate_per_delivery, 0) AS rate_per_delivery,
            COALESCE(r.rate_pct_of_fee, 0)   AS rate_pct_of_fee,
            COUNT(o.id)                      AS deliveries,
            COALESCE(SUM(o.cost), 0)         AS gross_fees,
            COALESCE(SUM(CASE WHEN o.revenue_status != 'paid' THEN o.cod_collected ELSE 0 END), 0) AS cod_held
       FROM riders r
       JOIN orders o
         ON o.assigned_to = r.id
        AND o.deleted_at IS NULL
        AND o.status IN ('delivered', 'confirmed', 'awaiting_confirmation')
        AND o.delivered_at >= ? AND o.delivered_at <= ?
      WHERE r.deleted_at IS NULL ${where}
      GROUP BY r.id
      ORDER BY r.name`,
  )
    .bind(...binds)
    .all<Record<string, unknown>>()

  const payouts: RiderPayout[] = (res.results ?? []).map(row => {
    const r = rowToObj<Record<string, number | string>>(row)!
    const deliveries = Number(r.deliveries)
    const grossFees = Number(r.grossFees)
    const ratePerDelivery = Number(r.ratePerDelivery)
    const ratePctOfFee = Number(r.ratePctOfFee)
    const codHeld = Number(r.codHeld)

    const perDeliveryPay = round2(deliveries * ratePerDelivery)
    const sharePay = round2(grossFees * ratePctOfFee)
    const totalPay = round2(perDeliveryPay + sharePay)

    return {
      riderId: String(r.riderId),
      riderName: String(r.riderName),
      riderPhone: String(r.riderPhone),
      deliveries,
      grossFees: round2(grossFees),
      perDeliveryPay,
      sharePay,
      totalPay,
      codHeld: round2(codHeld),
      netToRider: round2(totalPay - codHeld),
      ratePerDelivery,
      ratePctOfFee,
    }
  })

  return {
    from,
    to,
    payouts,
    totals: {
      deliveries: payouts.reduce((s, p) => s + p.deliveries, 0),
      pay: round2(payouts.reduce((s, p) => s + p.totalPay, 0)),
      codHeld: round2(payouts.reduce((s, p) => s + p.codHeld, 0)),
    },
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface CodPosition {
  riderId: string
  riderName: string
  riderPhone: string
  orders: number
  amount: number
  oldestCollectedAt: string
  /** How long the oldest uncollected cash has been sitting. */
  daysOutstanding: number
}

/**
 * Cash collected from customers and not yet banked, by rider.
 *
 * financeSummary already totals codOutstanding, but a single number tells you
 * money is missing without telling you whose pocket it is in or how long it has
 * been there. Both of those are the actual question.
 */
export async function codOutstandingByRider(env: Env, branchId?: string): Promise<{
  positions: CodPosition[]
  total: number
}> {
  const where = branchId ? 'AND r.branch_id = ?' : ''
  const binds: unknown[] = branchId ? [branchId] : []

  const res = await env.DB.prepare(
    `SELECT r.id   AS rider_id,
            r.name AS rider_name,
            r.phone AS rider_phone,
            COUNT(o.id) AS orders,
            COALESCE(SUM(o.cod_collected), 0) AS amount,
            MIN(o.delivered_at) AS oldest_collected_at
       FROM orders o
       JOIN riders r ON r.id = o.assigned_to
      WHERE o.deleted_at IS NULL
        AND r.deleted_at IS NULL
        AND o.cod_collected IS NOT NULL
        AND o.cod_collected > 0
        AND o.revenue_status != 'paid'
        ${where}
      GROUP BY r.id
      ORDER BY amount DESC`,
  )
    .bind(...binds)
    .all<Record<string, unknown>>()

  const now = Date.now()
  const positions: CodPosition[] = (res.results ?? []).map(row => {
    const r = rowToObj<Record<string, string | number>>(row)!
    const oldest = String(r.oldestCollectedAt ?? '')
    const parsed = Date.parse(oldest)
    return {
      riderId: String(r.riderId),
      riderName: String(r.riderName),
      riderPhone: String(r.riderPhone),
      orders: Number(r.orders),
      amount: round2(Number(r.amount)),
      oldestCollectedAt: oldest,
      daysOutstanding: Number.isNaN(parsed) ? 0 : Math.floor((now - parsed) / 86_400_000),
    }
  })

  return {
    positions,
    total: round2(positions.reduce((s, p) => s + p.amount, 0)),
  }
}
