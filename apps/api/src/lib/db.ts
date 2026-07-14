/**
 * Convert a D1 row (snake_case) to an application object (camelCase).
 * Handles JSON columns by parsing on the way out and stringifying on the way in.
 */
export function rowToObj<T = Record<string, unknown>>(
  row: Record<string, unknown> | null | undefined,
  jsonCols: string[] = [],
): T | undefined {
  if (!row) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const key = snakeToCamel(k)
    if (jsonCols.includes(k) && typeof v === 'string' && v.length) {
      try {
        out[key] = JSON.parse(v)
      } catch {
        out[key] = v
      }
    } else if (typeof v === 'number' && (k === 'active' || k.endsWith('_flag'))) {
      out[key] = v === 1
    } else {
      out[key] = v
    }
  }
  return out as T
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
}

/**
 * Turn a camelCase patch into ["col_name = ?", ...values].
 * Booleans → 0/1. Objects/arrays → JSON strings.
 */
export function buildUpdate(patch: Record<string, unknown>): { sets: string; values: unknown[] } {
  const parts: string[] = []
  const values: unknown[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    parts.push(`${camelToSnake(k)} = ?`)
    if (typeof v === 'boolean') values.push(v ? 1 : 0)
    else if (v !== null && typeof v === 'object') values.push(JSON.stringify(v))
    else values.push(v)
  }
  return { sets: parts.join(', '), values }
}

export function encodeCursor(row: Record<string, unknown> | undefined): string | undefined {
  if (!row) return undefined
  return btoa(JSON.stringify(row))
}

export function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) return undefined
  try {
    return JSON.parse(atob(cursor))
  } catch {
    return undefined
  }
}
