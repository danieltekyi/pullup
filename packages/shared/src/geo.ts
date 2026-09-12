/**
 * Which delivery zone a point falls in.
 *
 * The zones table has carried a polygon column since the schema was written and
 * nothing has ever used it. Instead, whoever raises an order types the zone as
 * free text, so "East Legon", "east legon" and "E. Legon" are three different
 * zones as far as any report is concerned — which is why zone-level numbers
 * have never been worth reading.
 *
 * Deriving it from the delivery coordinates is deterministic and needs no
 * model. It also fixes the reports retroactively in the sense that everything
 * from here on is consistent.
 */

export interface LatLng {
  lat: number
  lng: number
}

/**
 * Ray casting: count how many times a ray from the point crosses the polygon's
 * edges. Odd means inside.
 *
 * Chosen over the winding-number method because it is shorter and the polygons
 * here are simple city districts — no self-intersection, no holes.
 */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]

    // Does the edge straddle the point's latitude? The strict-then-loose
    // comparison means a vertex exactly level with the point counts once
    // rather than twice, which would otherwise flip the answer.
    const straddles = a.lat > point.lat !== b.lat > point.lat
    if (!straddles) continue

    const lngAtPointLat = ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng
    if (point.lng < lngAtPointLat) inside = !inside
  }
  return inside
}

export interface ZoneShape {
  name: string
  polygon: LatLng[]
}

/**
 * The first zone containing the point, or undefined.
 *
 * First rather than best: zones are meant not to overlap, and if two do, that
 * is a data problem to fix rather than something to paper over by silently
 * picking one. Returning the first at least makes the behaviour predictable.
 */
export function zoneForPoint(point: LatLng, zones: ZoneShape[]): string | undefined {
  return zones.find(z => pointInPolygon(point, z.polygon))?.name
}

/**
 * Reads a polygon out of whatever shape the zones table happens to hold.
 *
 * The column is free-form TEXT and was never written by code, so anything in it
 * arrived by hand.
 *
 * Arrays are read as GeoJSON, which is unambiguously [longitude, latitude].
 * An earlier version tried to detect the order by magnitude — anything above 90
 * had to be a longitude — which is correct almost everywhere and useless here:
 * Accra sits at roughly 5.6N 0.2W, so both numbers are small and the test
 * caught it reading the longitude as a latitude. Objects with named lat and lng
 * need no guessing and are the better thing to store.
 */
export function parsePolygon(raw: string | null | undefined): LatLng[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  const coords = Array.isArray(parsed)
    ? parsed
    : (parsed as { coordinates?: unknown })?.coordinates ?? []

  // GeoJSON wraps a polygon's outer ring in an extra array.
  const ring = Array.isArray(coords) && Array.isArray(coords[0]) && Array.isArray((coords[0] as unknown[])[0])
    ? (coords[0] as unknown[])
    : (coords as unknown[])

  const points: LatLng[] = []
  for (const item of ring) {
    if (Array.isArray(item) && item.length >= 2) {
      const [lng, lat] = item as number[]
      if (Number.isFinite(lat) && Number.isFinite(lng)) points.push({ lat, lng })
    } else if (item && typeof item === 'object' && 'lat' in item && 'lng' in item) {
      const o = item as LatLng
      if (Number.isFinite(o.lat) && Number.isFinite(o.lng)) points.push({ lat: o.lat, lng: o.lng })
    }
  }
  return points
}

/**
 * Roughly Ghana, with room to spare.
 *
 * Used to make bad data visible rather than silently wrong. A polygon entered
 * with the pair the wrong way round produces points in the Gulf of Guinea, and
 * every order would then fall outside every zone — which looks like "zones do
 * not work" rather than "that one row is reversed".
 */
const GHANA_BOUNDS = { minLat: 4.0, maxLat: 12.0, minLng: -4.0, maxLng: 2.0 }

export function looksLikeGhana(p: LatLng): boolean {
  return (
    p.lat >= GHANA_BOUNDS.minLat && p.lat <= GHANA_BOUNDS.maxLat &&
    p.lng >= GHANA_BOUNDS.minLng && p.lng <= GHANA_BOUNDS.maxLng
  )
}

/**
 * Reports a polygon that is probably stored with lat and lng swapped.
 *
 * Cheap to check and turns a silent whole-feature failure into one obviously
 * wrong row.
 */
export function polygonLooksReversed(points: LatLng[]): boolean {
  if (points.length < 3) return false
  const asStored = points.filter(looksLikeGhana).length
  const swapped = points.filter(p => looksLikeGhana({ lat: p.lng, lng: p.lat })).length
  return swapped > asStored
}
