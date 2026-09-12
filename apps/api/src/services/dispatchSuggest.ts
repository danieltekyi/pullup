import type { Env } from '../env'
import type { Order, Rider } from '@pullup/shared'
import { canBeAssignedWork } from '@pullup/shared'
import { listRiders } from '../repos/riders'
import { rowToObj } from '../lib/db'

/**
 * Who should take this delivery.
 *
 * rider.zone and order.destination_zone have both existed since the schema was
 * written and no code has ever compared them. Assignment is a human picking a
 * name from a list, which works at four riders and stops working somewhere
 * around fifteen — usually by quietly overloading whoever the dispatcher
 * remembers first.
 *
 * This suggests rather than assigns. At this fleet size the dispatcher knows
 * things the database does not — who is having a bad day, whose bike is making
 * a noise — and a ranked list they can override is more useful than an
 * automatic decision they have to undo. The scoring is transparent for the same
 * reason: a suggestion you cannot interrogate is one you stop trusting.
 */

export interface RiderSuggestion {
  riderId: string
  name: string
  zone: string
  /** Higher is better. Relative, not a probability. */
  score: number
  openOrders: number
  /** Plain-language reasons, shown to the dispatcher. */
  reasons: string[]
  /** Set when the rider cannot take work at all. */
  blockedReason?: string
}

const ZONE_MATCH = 50
const IDLE_BONUS = 20
const LOAD_PENALTY = 12
const ON_DELIVERY_PENALTY = 15

function normalise(zone: string | undefined | null): string {
  // Zones are free text today, so "East Legon" and "east legon " are the same
  // place. Deriving zones from coordinates fixes this properly; until every
  // order has them, comparing loosely is better than not comparing.
  return (zone ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function suggestRiders(
  env: Env,
  order: Order,
  branchId?: string,
  limit = 5,
): Promise<RiderSuggestion[]> {
  const riders = await listRiders(env, branchId ?? order.branchId)
  if (!riders.length) return []

  // One query for every rider's open workload rather than one per rider.
  const loads = await env.DB.prepare(
    `SELECT assigned_to AS rider_id, COUNT(*) AS n
       FROM orders
      WHERE deleted_at IS NULL
        AND assigned_to IS NOT NULL
        AND status IN ('assigned', 'picked_up', 'in_transit')
      GROUP BY assigned_to`,
  ).all<{ rider_id: string; n: number }>()

  const openBy = new Map<string, number>()
  for (const row of loads.results ?? []) openBy.set(row.rider_id, row.n)

  const target = normalise(order.destinationZone)

  const suggestions = riders.map<RiderSuggestion>(rider => {
    const open = openBy.get(rider.id) ?? 0
    const reasons: string[] = []
    let score = 0

    if (!canBeAssignedWork(rider.complianceStatus ?? 'pending')) {
      return {
        riderId: rider.id,
        name: rider.name,
        zone: rider.zone,
        score: -1,
        openOrders: open,
        reasons: [],
        blockedReason: 'Documents not in order',
      }
    }
    if (rider.status === 'inactive') {
      return {
        riderId: rider.id,
        name: rider.name,
        zone: rider.zone,
        score: -1,
        openOrders: open,
        reasons: [],
        blockedReason: 'Not an active rider',
      }
    }

    if (target && normalise(rider.zone) === target) {
      score += ZONE_MATCH
      reasons.push(`Works ${rider.zone}`)
    }

    if (open === 0) {
      score += IDLE_BONUS
      reasons.push('Nothing in hand')
    } else {
      score -= open * LOAD_PENALTY
      reasons.push(`${open} already open`)
    }

    if (rider.status === 'on_delivery') {
      score -= ON_DELIVERY_PENALTY
      reasons.push('Out on a delivery')
    }

    if (rider.complianceStatus === 'pending') {
      // Allowed to work, but worth surfacing so a dispatcher with a choice
      // picks the fully cleared rider.
      reasons.push('Documents under review')
    }

    return { riderId: rider.id, name: rider.name, zone: rider.zone, score, openOrders: open, reasons }
  })

  return suggestions
    .filter(s => !s.blockedReason)
    .sort((a, b) => b.score - a.score || a.openOrders - b.openOrders)
    .slice(0, limit)
}

/** Riders who cannot be given work, with the reason. */
export async function blockedRiders(env: Env, branchId?: string): Promise<Array<{ id: string; name: string; reason: string }>> {
  const res = await env.DB.prepare(
    `SELECT id, name, compliance_status, status FROM riders
      WHERE deleted_at IS NULL ${branchId ? 'AND branch_id = ?' : ''}
        AND (compliance_status = 'blocked' OR status = 'inactive')`,
  )
    .bind(...(branchId ? [branchId] : []))
    .all<Record<string, unknown>>()

  return (res.results ?? []).map(row => {
    const r = rowToObj<Rider & { complianceStatus?: string }>(row)!
    return {
      id: r.id,
      name: r.name,
      reason: r.status === 'inactive' ? 'Not an active rider' : 'Documents not in order',
    }
  })
}
