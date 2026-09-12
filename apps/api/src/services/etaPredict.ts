import type { Env } from '../env'

/**
 * Delivery time predicted from what actually happened, not from an average
 * speed.
 *
 * The quote has always estimated ETA as distance over 25 km/h plus ten minutes.
 * That is a reasonable guess and it is wrong in a specific, costly way: it does
 * not know that Spintex at 17:00 is not Spintex at 11:00, so the promise made
 * at booking is optimistic exactly when traffic is worst — which is when a
 * customer is most likely to be annoyed about it.
 *
 * The data to fix this is already recorded. Every order carries assigned_at,
 * picked_up_at and delivered_at.
 *
 * What is missing is volume. At the time of writing there are four orders with
 * complete timings, which is not enough to predict anything and is exactly the
 * situation where a model produces confident nonsense. So this measures its own
 * sample size and refuses to answer when it is thin, falling back to the
 * formula. It turns itself on as the business accumulates history, with no code
 * change and no decision to remember.
 */

/** Below this many comparable deliveries, the formula is the better answer. */
const MIN_SAMPLE = 20

/** Wider than needed, so a lunchtime drop is not compared against a dawn run. */
const HOUR_BAND = 3

export interface EtaPrediction {
  minutes: number
  source: 'history' | 'formula'
  /** How many past deliveries the answer is based on. */
  sampleSize: number
  /** Plain-language note for the console. */
  note: string
}

function bandFor(hour: number): { from: number; to: number } {
  const start = Math.floor(hour / HOUR_BAND) * HOUR_BAND
  return { from: start, to: start + HOUR_BAND }
}

/**
 * Median rather than mean.
 *
 * One delivery that sat for six hours because a rider's phone died would drag
 * an average badly at this sample size. The median ignores it.
 */
function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * How long this delivery is likely to take, in minutes.
 *
 * `fallbackMinutes` is the existing formula's answer, used whenever history
 * cannot support a better one.
 */
export async function predictEta(
  env: Env,
  opts: { destinationZone?: string; at?: Date; fallbackMinutes: number },
): Promise<EtaPrediction> {
  const at = opts.at ?? new Date()
  const band = bandFor(at.getUTCHours())
  const weekday = at.getUTCDay() === 0 || at.getUTCDay() === 6 ? 'weekend' : 'weekday'

  const formula = (note: string): EtaPrediction => ({
    minutes: opts.fallbackMinutes,
    source: 'formula',
    sampleSize: 0,
    note,
  })

  if (!opts.destinationZone) return formula('No zone on the order, so history cannot be matched.')

  try {
    // Minutes from assignment to delivery: the interval the customer actually
    // experiences. Pickup time is part of the wait, not an overhead to exclude.
    const res = await env.DB.prepare(
      `SELECT (julianday(delivered_at) - julianday(assigned_at)) * 1440 AS minutes
         FROM orders
        WHERE deleted_at IS NULL
          AND destination_zone = ?
          AND assigned_at IS NOT NULL
          AND delivered_at IS NOT NULL
          AND delivered_at > assigned_at
          AND CAST(strftime('%H', assigned_at) AS INTEGER) >= ?
          AND CAST(strftime('%H', assigned_at) AS INTEGER) < ?
          AND (CASE WHEN strftime('%w', assigned_at) IN ('0','6') THEN 'weekend' ELSE 'weekday' END) = ?
        ORDER BY delivered_at DESC
        LIMIT 200`,
    )
      .bind(opts.destinationZone, band.from, band.to, weekday)
      .all<{ minutes: number }>()

    const samples = (res.results ?? [])
      .map(r => Math.round(r.minutes))
      // A delivery recorded as taking under a minute or over eight hours is a
      // data entry artefact, not a journey. Including either teaches the
      // prediction something untrue.
      .filter(m => m >= 2 && m <= 480)

    if (samples.length < MIN_SAMPLE) {
      return formula(
        `Only ${samples.length} comparable ${samples.length === 1 ? 'delivery' : 'deliveries'} on record — ` +
          `need ${MIN_SAMPLE} before history beats the formula.`,
      )
    }

    return {
      minutes: median(samples),
      source: 'history',
      sampleSize: samples.length,
      note: `Median of ${samples.length} past deliveries to ${opts.destinationZone} at this time of day.`,
    }
  } catch (err) {
    console.error('eta prediction failed', (err as Error).message)
    return formula('Could not read delivery history.')
  }
}

/**
 * How the formula has been performing against reality.
 *
 * Worth watching even while predictions fall back: if the formula is
 * consistently optimistic, that is a number worth knowing long before there is
 * enough data to replace it.
 */
export async function etaAccuracy(env: Env): Promise<{
  measured: number
  medianActualMinutes: number
  readyZones: Array<{ zone: string; samples: number }>
}> {
  const res = await env.DB.prepare(
    `SELECT destination_zone AS zone,
            (julianday(delivered_at) - julianday(assigned_at)) * 1440 AS minutes
       FROM orders
      WHERE deleted_at IS NULL
        AND assigned_at IS NOT NULL AND delivered_at IS NOT NULL
        AND delivered_at > assigned_at`,
  ).all<{ zone: string | null; minutes: number }>()

  const rows = (res.results ?? []).filter(r => r.minutes >= 2 && r.minutes <= 480)
  const byZone = new Map<string, number>()
  for (const r of rows) {
    const z = r.zone ?? 'Unzoned'
    byZone.set(z, (byZone.get(z) ?? 0) + 1)
  }

  return {
    measured: rows.length,
    medianActualMinutes: median(rows.map(r => Math.round(r.minutes))),
    readyZones: [...byZone.entries()]
      .filter(([, n]) => n >= MIN_SAMPLE)
      .map(([zone, samples]) => ({ zone, samples }))
      .sort((a, b) => b.samples - a.samples),
  }
}
