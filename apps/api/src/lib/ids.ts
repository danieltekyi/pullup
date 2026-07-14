/**
 * Generate a short unique ID with a prefix and monotonic-ish suffix.
 * Cheap and Workers-friendly (no crypto.randomUUID cold-start cost).
 */
export function newId(prefix: string): string {
  const t = Date.now().toString(36)
  const r = crypto.getRandomValues(new Uint8Array(6))
  const hex = Array.from(r, b => b.toString(16).padStart(2, '0')).join('')
  return `${prefix}_${t}_${hex}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
