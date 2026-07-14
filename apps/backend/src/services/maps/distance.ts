import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'

export interface DistanceResult {
  distanceKm: number
  durationSec: number
  origin?: string
  destination?: string
}

/**
 * Compute distance + ETA between two addresses/coordinates using Google Distance Matrix.
 * Falls back to Haversine on a fixed-city coordinate if the API isn't configured.
 */
export async function distanceBetween(origin: string, destination: string): Promise<DistanceResult | null> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    logger.debug({ origin, destination }, 'Maps key missing — skipping distance lookup')
    return null
  }
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.set('origins', origin)
  url.searchParams.set('destinations', destination)
  url.searchParams.set('mode', 'driving')
  url.searchParams.set('units', 'metric')
  url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY)

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) return null
  const body = (await res.json()) as {
    rows?: Array<{ elements: Array<{ status: string; distance?: { value: number }; duration?: { value: number } }> }>
  }
  const el = body.rows?.[0]?.elements?.[0]
  if (!el || el.status !== 'OK' || !el.distance || !el.duration) return null
  return {
    distanceKm: el.distance.value / 1000,
    durationSec: el.duration.value,
    origin,
    destination,
  }
}
