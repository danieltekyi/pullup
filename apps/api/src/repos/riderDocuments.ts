import type { Env } from '../env'
import { rowToObj, buildUpdate } from '../lib/db'
import { newId, nowIso } from '../lib/ids'
import type { RiderDocument } from '@pullup/shared'
import { evaluateCompliance, type DocumentType } from '@pullup/shared'
import { notFound } from '../lib/errors'

export async function listRiderDocuments(env: Env, riderId: string): Promise<RiderDocument[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM rider_documents WHERE rider_id = ? AND deleted_at IS NULL ORDER BY type`,
  )
    .bind(riderId)
    .all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<RiderDocument>(r)!)
}

export async function findRiderDocument(env: Env, id: string): Promise<RiderDocument | undefined> {
  const row = await env.DB.prepare(`SELECT * FROM rider_documents WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<Record<string, unknown>>()
  return rowToObj<RiderDocument>(row)
}

/**
 * Stores a document, replacing any existing one of the same type.
 *
 * Replacing rather than accumulating is deliberate: a rider renewing their
 * insurance should not leave last year's policy sitting alongside this year's,
 * because then "is this rider insured" has two answers. The old row is soft
 * deleted, so the history survives for audit without confusing the check.
 */
export async function upsertRiderDocument(
  env: Env,
  riderId: string,
  data: {
    type: DocumentType
    reference?: string
    issuedOn?: string
    expiresOn?: string
    fileKey?: string
    fileType?: string
    notes?: string
  },
): Promise<RiderDocument> {
  const now = nowIso()

  await env.DB.prepare(
    `UPDATE rider_documents SET deleted_at = ?, updated_at = ?
      WHERE rider_id = ? AND type = ? AND deleted_at IS NULL`,
  )
    .bind(now, now, riderId, data.type)
    .run()

  const id = newId('rdoc')
  await env.DB.prepare(
    `INSERT INTO rider_documents
       (id, rider_id, type, reference, issued_on, expires_on, file_key, file_type, status, notes, created_at, updated_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1)`,
  )
    .bind(
      id,
      riderId,
      data.type,
      data.reference ?? null,
      data.issuedOn ?? null,
      data.expiresOn ?? null,
      data.fileKey ?? null,
      data.fileType ?? null,
      data.notes ?? null,
      now,
      now,
    )
    .run()

  await recomputeRiderCompliance(env, riderId)
  return (await findRiderDocument(env, id))!
}

export async function setDocumentVerification(
  env: Env,
  id: string,
  patch: { status: 'verified' | 'rejected'; verifiedBy: string; rejectionReason?: string },
): Promise<RiderDocument> {
  const doc = await findRiderDocument(env, id)
  if (!doc) throw notFound('document not found')

  const { sets, values } = buildUpdate({
    status: patch.status,
    verifiedBy: patch.verifiedBy,
    verifiedAt: nowIso(),
    updatedAt: nowIso(),
    // Cleared on approval so a previously rejected document does not keep
    // showing the old reason once it is accepted.
    rejectionReason: patch.status === 'rejected' ? (patch.rejectionReason ?? 'No reason given') : null,
  })

  await env.DB.prepare(`UPDATE rider_documents SET ${sets}, version = version + 1 WHERE id = ?`)
    .bind(...values, id)
    .run()
  await recomputeRiderCompliance(env, doc.riderId)
  return (await findRiderDocument(env, id))!
}

export async function softDeleteRiderDocument(env: Env, id: string): Promise<void> {
  const doc = await findRiderDocument(env, id)
  if (!doc) throw notFound('document not found')
  await env.DB.prepare(`UPDATE rider_documents SET deleted_at = ?, updated_at = ? WHERE id = ?`)
    .bind(nowIso(), nowIso(), id)
    .run()
  await recomputeRiderCompliance(env, doc.riderId)
}

/**
 * Recalculates a rider's compliance and writes it onto the rider row.
 *
 * The denormalised copy exists so dispatch can check one column instead of
 * joining documents on every assignment. That is only safe if it is rewritten
 * on every path that could change the answer — document upload, verification,
 * deletion, and the daily sweep that catches documents lapsing with nobody
 * touching them.
 */
export async function recomputeRiderCompliance(env: Env, riderId: string) {
  const docs = await listRiderDocuments(env, riderId)
  // The grace window is read here rather than passed in, so every caller —
  // upload, verification, the sweep — applies it identically. A path that
  // forgot it would block a rider who is still inside their onboarding period.
  const rider = await env.DB.prepare(
    `SELECT compliance_grace_until FROM riders WHERE id = ?`,
  )
    .bind(riderId)
    .first<{ compliance_grace_until: string | null }>()

  const result = evaluateCompliance(docs, new Date(), rider?.compliance_grace_until)
  await env.DB.prepare(
    `UPDATE riders
        SET compliance_status = ?, compliance_checked_at = ?, compliance_expires_on = ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(result.status, nowIso(), result.nextExpiry ?? null, nowIso(), riderId)
    .run()
  return result
}

/**
 * Documents that have lapsed or are about to, across every active rider.
 *
 * Joined to riders so an alert can name the person rather than a document id,
 * and so an inactive rider does not generate noise nobody will act on.
 */
export async function findExpiringDocuments(
  env: Env,
  withinDays = 30,
): Promise<Array<RiderDocument & { riderName: string; riderPhone: string; riderEmail?: string }>> {
  const cutoff = new Date(Date.now() + withinDays * 86_400_000).toISOString().slice(0, 10)
  const res = await env.DB.prepare(
    `SELECT d.*, r.name AS rider_name, r.phone AS rider_phone, r.email AS rider_email
       FROM rider_documents d
       JOIN riders r ON r.id = d.rider_id
      WHERE d.deleted_at IS NULL
        AND r.deleted_at IS NULL
        AND r.status != 'inactive'
        AND d.expires_on IS NOT NULL
        AND d.expires_on <= ?
        AND d.status != 'rejected'
      ORDER BY d.expires_on ASC
      LIMIT 200`,
  )
    .bind(cutoff)
    .all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<RiderDocument & { riderName: string; riderPhone: string; riderEmail?: string }>(r)!)
}

/** Every rider's compliance state, for the console and the dashboard tile. */
export async function complianceOverview(env: Env, branchId?: string): Promise<{
  compliant: number
  pending: number
  blocked: number
  expiringSoon: number
  awaitingVerification: number
}> {
  const where = branchId ? 'AND r.branch_id = ?' : ''
  const bind = branchId ? [branchId] : []

  const counts = await env.DB.prepare(
    `SELECT compliance_status AS s, COUNT(*) AS n
       FROM riders r
      WHERE r.deleted_at IS NULL AND r.status != 'inactive' ${where}
      GROUP BY compliance_status`,
  )
    .bind(...bind)
    .all<{ s: string; n: number }>()

  const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const expiring = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rider_documents d JOIN riders r ON r.id = d.rider_id
      WHERE d.deleted_at IS NULL AND r.deleted_at IS NULL AND r.status != 'inactive'
        AND d.expires_on IS NOT NULL AND d.expires_on <= ? AND d.status = 'verified' ${where}`,
  )
    .bind(soon, ...bind)
    .first<{ n: number }>()

  const awaiting = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rider_documents d JOIN riders r ON r.id = d.rider_id
      WHERE d.deleted_at IS NULL AND r.deleted_at IS NULL AND d.status = 'pending' ${where}`,
  )
    .bind(...bind)
    .first<{ n: number }>()

  const by: Record<string, number> = {}
  for (const row of counts.results ?? []) by[row.s] = row.n

  return {
    compliant: by.compliant ?? 0,
    pending: by.pending ?? 0,
    blocked: by.blocked ?? 0,
    expiringSoon: expiring?.n ?? 0,
    awaitingVerification: awaiting?.n ?? 0,
  }
}
