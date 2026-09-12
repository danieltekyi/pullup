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
  evaluateCompliance,
  canBeAssignedWork,
  documentSpec,
  DOCUMENT_SPECS,
  REQUIRED_DOCUMENT_TYPES,
  pointInPolygon,
  parsePolygon,
  zoneForPoint,
  looksLikeGhana,
  polygonLooksReversed,
} from '@pullup/shared'
import type { OrderStatus } from '@pullup/shared'
import { TREND_FORMATS } from '../src/repos/orders'
import { NOTIFIED_STATUSES } from '../src/services/customerNotify'
import { secretsMatch, escapeHtml } from '../src/routes/internal'

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

describe('rider compliance (owner-operator model)', () => {
  const now = new Date('2026-09-06T00:00:00.000Z')
  const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString()

  /** Every required document, verified and in date. */
  const allGood = () =>
    REQUIRED_DOCUMENT_TYPES.map(type => ({
      type,
      status: 'verified' as const,
      expiresOn: documentSpec(type)?.expires ? day(200) : null,
    }))

  it('clears a rider whose documents are all current', () => {
    const r = evaluateCompliance(allGood(), now)
    expect(r.status).toBe('compliant')
    expect(canBeAssignedWork(r.status)).toBe(true)
  })

  it('blocks a rider whose insurance has lapsed', () => {
    // The case with legal weight. PullUp no longer owns the bikes, so an
    // uninsured rider carrying a client's parcel is the company's exposure.
    const docs = allGood().map(d =>
      d.type === 'motor_insurance' ? { ...d, expiresOn: day(-1) } : d,
    )
    const r = evaluateCompliance(docs, now)
    expect(r.status).toBe('blocked')
    expect(r.expired).toContain('motor_insurance')
    expect(canBeAssignedWork(r.status)).toBe(false)
    expect(r.blockingReason).toMatch(/insurance/i)
  })

  it('treats a document expiring today as still valid', () => {
    // Cover runs to the end of its final day. Blocking a day early costs a
    // rider a day's earnings for nothing.
    const docs = allGood().map(d =>
      d.type === 'roadworthy' ? { ...d, expiresOn: now.toISOString() } : d,
    )
    expect(evaluateCompliance(docs, now).status).toBe('compliant')
  })

  it('blocks a rider who never supplied a required document', () => {
    const r = evaluateCompliance(allGood().filter(d => d.type !== 'rider_licence'), now)
    expect(r.status).toBe('blocked')
    expect(r.missing).toContain('rider_licence')
  })

  it('blocks on a rejected document', () => {
    const docs = allGood().map(d =>
      d.type === 'ghana_card' ? { ...d, status: 'rejected' as const } : d,
    )
    const r = evaluateCompliance(docs, now)
    expect(r.status).toBe('blocked')
    expect(r.rejected).toContain('ghana_card')
  })

  it('does not block a rider waiting on our review', () => {
    // The rider has done their part. Blocking here would punish them for our
    // queue length, so dispatch sees 'pending' and decides.
    const docs = allGood().map(d =>
      d.type === 'roadworthy' ? { ...d, status: 'pending' as const } : d,
    )
    const r = evaluateCompliance(docs, now)
    expect(r.status).toBe('pending')
    expect(canBeAssignedWork(r.status)).toBe(true)
  })

  it('counts expiry ahead of a stale verified stamp', () => {
    // A document approved last year and expired last week is expired,
    // whatever its stored status says.
    const docs = allGood().map(d =>
      d.type === 'motor_insurance' ? { ...d, status: 'verified' as const, expiresOn: day(-30) } : d,
    )
    expect(evaluateCompliance(docs, now).expired).toContain('motor_insurance')
  })

  it('warns before expiry rather than after', () => {
    const docs = allGood().map(d =>
      d.type === 'motor_insurance' ? { ...d, expiresOn: day(10) } : d,
    )
    const r = evaluateCompliance(docs, now)
    expect(r.status).toBe('compliant')
    expect(r.expiringSoon.map(e => e.type)).toContain('motor_insurance')
    expect(r.expiringSoon[0].daysLeft).toBe(10)
  })

  it('reports the soonest expiry first', () => {
    const docs = allGood().map(d => {
      if (d.type === 'motor_insurance') return { ...d, expiresOn: day(20) }
      if (d.type === 'roadworthy') return { ...d, expiresOn: day(5) }
      return d
    })
    const r = evaluateCompliance(docs, now)
    expect(r.expiringSoon[0].type).toBe('roadworthy')
    expect(r.nextExpiry?.slice(0, 10)).toBe(day(5).slice(0, 10))
  })

  it('requires insurance and roadworthy, which is what makes this legal rather than tidy', () => {
    expect(REQUIRED_DOCUMENT_TYPES).toContain('motor_insurance')
    expect(REQUIRED_DOCUMENT_TYPES).toContain('roadworthy')
    expect(REQUIRED_DOCUMENT_TYPES).toContain('rider_licence')
  })

  it('does not block on an optional document', () => {
    // Bike registration is only relevant when the bike is in the rider's name,
    // so a rider borrowing a machine must not be grounded by it.
    const spec = documentSpec('bike_registration')
    expect(spec?.required).toBe(false)
    expect(evaluateCompliance(allGood(), now).status).toBe('compliant')
  })

  it('gives every document that expires a reason to be tracked', () => {
    for (const spec of DOCUMENT_SPECS) {
      expect(spec.why.length, `${spec.type} has no explanation`).toBeGreaterThan(20)
    }
  })
})
describe('compliance grace window', () => {
  const now = new Date('2026-09-06T00:00:00.000Z')
  const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString()

  const allGood = () =>
    REQUIRED_DOCUMENT_TYPES.map(type => ({
      type,
      status: 'verified' as const,
      expiresOn: documentSpec(type)?.expires ? day(200) : null,
    }))

  it('does not ground a rider who has supplied nothing yet, while in grace', () => {
    // The fleet that existed when this model shipped had zero documents on
    // file. Evaluating them strictly would have stopped every round at once.
    const r = evaluateCompliance([], now, day(30))
    expect(r.status).toBe('pending')
    expect(canBeAssignedWork(r.status)).toBe(true)
    expect(r.blockingReason).toMatch(/30 more days/)
  })

  it('blocks the same rider once grace runs out', () => {
    const r = evaluateCompliance([], now, day(-1))
    expect(r.status).toBe('blocked')
    expect(canBeAssignedWork(r.status)).toBe(false)
  })

  it('blocks a rider with no grace at all', () => {
    // Riders onboarded after the change supply documents before their first
    // round, so they never get a window.
    expect(evaluateCompliance([], now).status).toBe('blocked')
  })

  it('never lets grace excuse expired insurance', () => {
    // The whole point of the check. A grace period on lapsed cover would be
    // worse than no check, because it would look like one.
    const docs = allGood().map(d =>
      d.type === 'motor_insurance' ? { ...d, expiresOn: day(-1) } : d,
    )
    const r = evaluateCompliance(docs, now, day(30))
    expect(r.status).toBe('blocked')
    expect(r.expired).toContain('motor_insurance')
  })

  it('never lets grace excuse a rejected document', () => {
    const docs = allGood().map(d =>
      d.type === 'ghana_card' ? { ...d, status: 'rejected' as const } : d,
    )
    expect(evaluateCompliance(docs, now, day(30)).status).toBe('blocked')
  })

  it('does not punish a rider for uploading their first document', () => {
    // The trap this fixes: partial compliance mid-grace must stay workable, or
    // a rider doing the right thing grounds themselves by doing it.
    const partial = [{ type: 'rider_licence', status: 'pending' as const, expiresOn: day(300) }]
    const r = evaluateCompliance(partial, now, day(30))
    expect(r.status).toBe('pending')
    expect(canBeAssignedWork(r.status)).toBe(true)
    expect(r.missing.length).toBeGreaterThan(0)
  })

  it('reports how long is left so the message is actionable', () => {
    expect(evaluateCompliance([], now, day(1)).blockingReason).toMatch(/1 more day\b/)
    expect(evaluateCompliance([], now, day(7)).blockingReason).toMatch(/7 more days/)
  })

  it('drops the grace flag once it has passed', () => {
    expect(evaluateCompliance([], now, day(5)).graceUntil).toBeTruthy()
    expect(evaluateCompliance([], now, day(-5)).graceUntil).toBeUndefined()
  })
})
describe('customer lifecycle notifications', () => {
  it('tells the customer at the moments they would otherwise ring us', () => {
    // Previously exactly one of eleven statuses produced a message. A customer
    // wondering where their parcel was had no option but to call.
    for (const s of ['picked_up', 'delivered', 'awaiting_confirmation', 'failed', 'cancelled', 'returned']) {
      expect(NOTIFIED_STATUSES, `${s} should notify the customer`).toContain(s)
    }
  })

  it('stays quiet on statuses a customer cannot act on', () => {
    // Each SMS costs money in Ghana, and a customer who gets five texts about
    // one parcel stops reading all of them. "A rider has been allocated" tells
    // someone nothing useful.
    expect(NOTIFIED_STATUSES).not.toContain('assigned')
    expect(NOTIFIED_STATUSES).not.toContain('in_transit')
    expect(NOTIFIED_STATUSES).not.toContain('confirmed')
  })

  it('notifies on fewer than half the statuses', () => {
    // A guard against the list quietly growing until every transition texts.
    const all = Object.keys(ORDER_STATUS_FLOW).length
    expect(NOTIFIED_STATUSES.length).toBeLessThan(all / 2 + 1)
  })

  it('only names statuses that exist in the lifecycle', () => {
    for (const s of NOTIFIED_STATUSES) {
      expect(Object.keys(ORDER_STATUS_FLOW), `${s} is not a real status`).toContain(s)
    }
  })
})

describe('internal endpoint auth', () => {
  // This comparison is the only thing between the internal endpoints and the
  // open internet, so it is tested directly rather than by reading the source.

  it('accepts the exact secret', () => {
    expect(secretsMatch('s3cret-value', 's3cret-value')).toBe(true)
  })

  it('rejects a wrong secret of the same length', () => {
    expect(secretsMatch('s3cret-value', 's3cret-valuX')).toBe(false)
  })

  it('rejects a correct prefix', () => {
    // The attack a naive === invites: probe one character at a time.
    expect(secretsMatch('s3cret-value', 's3cret')).toBe(false)
    expect(secretsMatch('s3cret', 's3cret-value')).toBe(false)
  })

  it('rejects empty against non-empty', () => {
    expect(secretsMatch('', 's3cret')).toBe(false)
    expect(secretsMatch('s3cret', '')).toBe(false)
  })

  it('compares every character rather than stopping at the first difference', () => {
    // Same length, differing only in the last character. A short-circuiting
    // comparison would return sooner here than for an early difference, and
    // that timing gap is the whole vulnerability.
    expect(secretsMatch('aaaaaaaaaaaa', 'aaaaaaaaaaab')).toBe(false)
    expect(secretsMatch('aaaaaaaaaaaa', 'baaaaaaaaaaa')).toBe(false)
  })
})

describe('lead relay escaping', () => {
  it('neutralises HTML from a public form', () => {
    // Name and message arrive from the website contact form and go straight
    // into an email body.
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('escapes ampersands before anything else', () => {
    // Getting this order wrong double-escapes: &lt; becomes &amp;lt;.
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml('<a href="x">')).toBe('&lt;a href=&quot;x&quot;&gt;')
  })

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Ama Owusu, Osu — 40 drops')).toBe('Ama Owusu, Osu — 40 drops')
  })
})
describe('zone from coordinates (A-10)', () => {
  // A square around central Accra, in {lat,lng}.
  const square = [
    { lat: 5.55, lng: -0.25 },
    { lat: 5.65, lng: -0.25 },
    { lat: 5.65, lng: -0.15 },
    { lat: 5.55, lng: -0.15 },
  ]

  it('places a point inside', () => {
    expect(pointInPolygon({ lat: 5.6, lng: -0.2 }, square)).toBe(true)
  })

  it('places a point outside', () => {
    expect(pointInPolygon({ lat: 5.9, lng: -0.2 }, square)).toBe(false)
    expect(pointInPolygon({ lat: 5.6, lng: -0.4 }, square)).toBe(false)
  })

  it('refuses a shape that is not a polygon', () => {
    expect(pointInPolygon({ lat: 5.6, lng: -0.2 }, [])).toBe(false)
    expect(pointInPolygon({ lat: 5.6, lng: -0.2 }, square.slice(0, 2))).toBe(false)
  })

  it('does not double-count a vertex level with the point', () => {
    // The classic ray-casting bug: a ray passing exactly through a vertex
    // crosses two edges and flips the answer twice, reporting inside as
    // outside.
    expect(pointInPolygon({ lat: 5.55, lng: -0.2 }, square)).toBe(true)
  })

  it('reads GeoJSON longitude-first ordering', () => {
    // [lng, lat] is the opposite of how everyone says it aloud, and therefore
    // the most likely thing to be entered wrong by hand.
    const parsed = parsePolygon(JSON.stringify([[-0.25, 5.55], [-0.25, 5.65], [-0.15, 5.65]]))
    expect(parsed).toHaveLength(3)
    expect(parsed[0].lat).toBeCloseTo(5.55)
    expect(parsed[0].lng).toBeCloseTo(-0.25)
  })

  it('reads plain lat/lng objects too', () => {
    const parsed = parsePolygon(JSON.stringify(square))
    expect(parsed).toHaveLength(4)
    expect(parsed[0].lat).toBeCloseTo(5.55)
  })

  it('survives whatever is actually in the column', () => {
    // The polygon column is free-form TEXT that no code has ever written, so
    // anything in it arrived by hand.
    expect(parsePolygon(null)).toEqual([])
    expect(parsePolygon('')).toEqual([])
    expect(parsePolygon('not json at all')).toEqual([])
    expect(parsePolygon('{"nope":1}')).toEqual([])
  })

  it('names the zone a point falls in', () => {
    const zones = [
      { name: 'Central Accra', polygon: square },
      { name: 'Tema', polygon: [{ lat: 5.6, lng: 0.0 }, { lat: 5.7, lng: 0.0 }, { lat: 5.7, lng: 0.1 }, { lat: 5.6, lng: 0.1 }] },
    ]
    expect(zoneForPoint({ lat: 5.6, lng: -0.2 }, zones)).toBe('Central Accra')
    expect(zoneForPoint({ lat: 5.65, lng: 0.05 }, zones)).toBe('Tema')
    expect(zoneForPoint({ lat: 8.0, lng: -1.0 }, zones)).toBeUndefined()
  })
})
describe('polygon data sanity (A-10)', () => {
  const accra = [
    { lat: 5.55, lng: -0.25 },
    { lat: 5.65, lng: -0.25 },
    { lat: 5.65, lng: -0.15 },
    { lat: 5.55, lng: -0.15 },
  ]

  it('accepts a polygon that is actually in Ghana', () => {
    expect(polygonLooksReversed(accra)).toBe(false)
    expect(accra.every(looksLikeGhana)).toBe(true)
  })

  it('spots a polygon stored with the pair the wrong way round', () => {
    // Without this the points land in the Gulf of Guinea, every order falls
    // outside every zone, and it reads as "zones do not work" rather than
    // "that one row is reversed".
    const reversed = accra.map(p => ({ lat: p.lng, lng: p.lat }))
    expect(polygonLooksReversed(reversed)).toBe(true)
  })

  it('does not cry wolf on too few points to judge', () => {
    expect(polygonLooksReversed(accra.slice(0, 2))).toBe(false)
  })
})
describe('the API and the website must quote the same price', () => {
  /*
    The most expensive fault found in this codebase.

    Probed production: a 9.2 km, 3 kg delivery quoted GHS 14.36 through the
    customer app while the website's calculator quoted about GHS 45 for the
    same trip. The API price is the binding one — publicOrders.ts recomputes
    server-side and ignores the client — so every order booked through the app
    was charged roughly a third of the advertised rate.

    Two models that were never reconciled: the website's was calibrated to the
    band the business actually sells at, the API kept seed defaults nobody
    tuned. Neither was obviously wrong on its own, which is why it survived.

    These recalibrated parameters are what migration 0005 writes to the params
    table. The test is the reason the two cannot drift apart again silently.
  */
  const CALIBRATED = {
    fuel_price: 15.5,
    base_efficiency: 40.0,
    max_payload: 50.0,
    alpha: 0.3,
    maintenance_rate_per_km: 0.35,
    beta: 0.2,
    terrain_factor: 1.0,
    salary_per_delivery: 18.0,
    overhead_per_delivery: 6.0,
    profit_margin: 31.03,
  }

  /** The website's formula, mirrored from src/react-app/data/pricing.ts. */
  function siteQuote(km: number, kg: number): number {
    const fuel = (km / 40) * 15.5
    const wear = km * 0.35
    const surcharge = Math.max(0, kg - 5) * 1.2
    const raw = fuel + wear + 24 + surcharge
    return Math.max(35, Math.round((raw + raw * 0.45) * 100) / 100)
  }

  it('agrees with the website on a typical Accra delivery', () => {
    const api = computePhysicsCost(9.2, 3, CALIBRATED).charge
    const site = siteQuote(9.2, 3)
    // Within a cedi. The load adjustment means they cannot be identical, and
    // chasing the last pesewa would make this test fragile without making the
    // price more correct.
    expect(Math.abs(api - site)).toBeLessThan(1)
  })

  it('agrees across the range of distances actually delivered', () => {
    for (const km of [2, 5, 8, 12, 18, 25]) {
      const api = computePhysicsCost(km, 3, CALIBRATED).charge
      const site = siteQuote(km, 3)
      expect(
        Math.abs(api - site),
        `${km}km: API quotes ${api}, site quotes ${site}`,
      ).toBeLessThan(1.5)
    }
  })

  it('lands a typical delivery in the band the business sells at', () => {
    // The calibration comment on the website's parameters says GHS 40–55.
    const charge = computePhysicsCost(9.2, 3, CALIBRATED).charge
    expect(charge).toBeGreaterThanOrEqual(40)
    expect(charge).toBeLessThanOrEqual(55)
  })

  it('shows how badly the uncalibrated defaults undercharged', () => {
    // Documents the fault rather than asserting a preference: if someone
    // reverts the params, this is what they are reverting to.
    const seeded = computePhysicsCost(9.2, 3).charge
    const calibrated = computePhysicsCost(9.2, 3, CALIBRATED).charge
    expect(seeded).toBeLessThan(20)
    expect(calibrated / seeded).toBeGreaterThan(2.5)
  })

  it('pays a rider something an owner-operator could accept', () => {
    // The seed default was GHS 5 a delivery, which never worked and is
    // impossible now the rider buys their own fuel out of it.
    expect(CALIBRATED.salary_per_delivery).toBeGreaterThanOrEqual(15)
  })
})