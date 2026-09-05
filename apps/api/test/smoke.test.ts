import { describe, expect, it } from 'vitest'
import {
  computePhysicsCost,
  DEFAULT_PERMISSIONS,
  can,
  ORDER_STATUS_FLOW,
  TERMINAL_ORDER_STATUSES,
  isLegalTransition,
  describeNextStatuses,
  defaultSlaBy,
  SLA_HOURS_BY_PRIORITY,
} from '@pullup/shared'
import type { OrderStatus } from '@pullup/shared'
import { TREND_FORMATS } from '../src/repos/orders'

describe('shared physics', () => {
  it('computes a plausible charge', () => {
    const b = computePhysicsCost(10, 5)
    expect(b.charge).toBeGreaterThan(0)
    expect(Number.isFinite(b.charge)).toBe(true)
  })
})

describe('permissions', () => {
  it('rider cannot delete orders', () => {
    expect(can(DEFAULT_PERMISSIONS.rider, 'orders', 'delete')).toBe(false)
  })
})

describe('order lifecycle (F-04)', () => {
  it('refuses the jump that used to be possible', () => {
    // The flow constant existed from the start and nothing consulted it, so an
    // order could go straight from pending to delivered — leaving assigned_at
    // and picked_up_at null on a delivered order and corrupting any duration
    // measured from those columns.
    expect(isLegalTransition('pending', 'delivered')).toBe(false)
    expect(isLegalTransition('pending', 'confirmed')).toBe(false)
    expect(isLegalTransition('cancelled', 'assigned')).toBe(false)
  })

  it('allows the ordinary happy path', () => {
    const path: OrderStatus[] = ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'confirmed']
    for (let i = 0; i < path.length - 1; i++) {
      expect(isLegalTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`).toBe(true)
    }
  })

  it('treats re-applying the same status as legal', () => {
    // A rider on a poor connection retrying the same request should get the
    // order back, not a 409.
    for (const s of Object.keys(ORDER_STATUS_FLOW) as OrderStatus[]) {
      expect(isLegalTransition(s, s), `${s} -> ${s}`).toBe(true)
    }
  })

  it('lets nothing escape a terminal state', () => {
    for (const s of TERMINAL_ORDER_STATUSES) {
      expect(ORDER_STATUS_FLOW[s]).toEqual([])
    }
  })

  it('leaves every status able to reach a terminal one', () => {
    // Guards against a future edit stranding a status: an order in a state with
    // no route to a terminal one sits in the queue forever.
    const reaches = (from: OrderStatus, seen = new Set<OrderStatus>()): boolean => {
      if (TERMINAL_ORDER_STATUSES.includes(from)) return true
      if (seen.has(from)) return false
      seen.add(from)
      return (ORDER_STATUS_FLOW[from] ?? []).some(next => reaches(next, seen))
    }
    for (const status of Object.keys(ORDER_STATUS_FLOW) as OrderStatus[]) {
      expect(reaches(status), `${status} cannot reach a terminal state`).toBe(true)
    }
  })

  it('explains where an order can go instead', () => {
    expect(describeNextStatuses('pending')).toContain('Assigned')
    expect(describeNextStatuses('confirmed')).toContain('final state')
  })
})

describe('SLA deadlines (F-05)', () => {
  const at = new Date('2026-09-05T09:00:00.000Z')

  it('gives every order a deadline, because none previously had one', () => {
    // Verified against production: all 12 orders had sla_by NULL. A column
    // nothing writes cannot be a column anything watches, so the SLA watcher
    // would have found nothing forever.
    expect(defaultSlaBy('normal', at)).toBe('2026-09-05T17:00:00.000Z')
  })

  it('gives an urgent delivery less time than a normal one', () => {
    expect(new Date(defaultSlaBy('urgent', at)).getTime())
      .toBeLessThan(new Date(defaultSlaBy('normal', at)).getTime())
    expect(new Date(defaultSlaBy('normal', at)).getTime())
      .toBeLessThan(new Date(defaultSlaBy('low', at)).getTime())
  })

  it('falls back to the normal window for an unknown priority', () => {
    expect(defaultSlaBy(undefined, at)).toBe(defaultSlaBy('normal', at))
    expect(defaultSlaBy('nonsense', at)).toBe(defaultSlaBy('normal', at))
  })

  it('always produces a deadline in the future', () => {
    for (const p of Object.keys(SLA_HOURS_BY_PRIORITY)) {
      expect(new Date(defaultSlaBy(p, at)).getTime()).toBeGreaterThan(at.getTime())
    }
  })
})

describe('trend bucketing (F-03)', () => {
  it('uses a zero-padded week so periods sort in the order they happened', () => {
    // The old JS label was `W${week}-${year}`, which sorted W10 before W5.
    expect(TREND_FORMATS.weekly).toBe('%Y-W%W')
    const labels = ['2026-W05', '2026-W10', '2026-W02']
    expect([...labels].sort()).toEqual(['2026-W02', '2026-W05', '2026-W10'])
  })

  it('sorts every period format lexically by date', () => {
    for (const fmt of Object.values(TREND_FORMATS)) {
      expect(fmt.startsWith('%Y'), `${fmt} must lead with the year to sort correctly`).toBe(true)
    }
  })
})
