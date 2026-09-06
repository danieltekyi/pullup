import { Hono } from 'hono'
import { z } from 'zod'
import type { AppVariables, Env } from '../env'
import { requireAuth, requireRole } from '../middleware/access'
import { getBranchFilter } from '../middleware/branchScope'
import { badRequest, forbidden, notFound } from '../lib/errors'
import {
  complianceOverview,
  findRiderDocument,
  listRiderDocuments,
  recomputeRiderCompliance,
  setDocumentVerification,
  softDeleteRiderDocument,
  upsertRiderDocument,
} from '../repos/riderDocuments'
import { listRiders, findRider } from '../repos/riders'
import { saveRiderDocument } from '../services/storage/r2'
import { evaluateCompliance, DOCUMENT_SPECS, type DocumentType } from '@pullup/shared'

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>()

const DOC_TYPES = DOCUMENT_SPECS.map(d => d.type) as [DocumentType, ...DocumentType[]]

/**
 * A rider may read and write their own documents; a manager may read anyone's.
 *
 * Without this a rider could enumerate other riders' licence and Ghana Card
 * images by changing an id in the URL — the same class of fault as the tracker
 * leak, on more sensitive data.
 */
function assertMaySeeRider(c: { get: (k: 'user') => { role: string; riderId?: string } | undefined }, riderId: string) {
  const user = c.get('user')!
  if (user.role === 'rider') {
    if (user.riderId !== riderId) throw forbidden('you can only see your own documents')
    return
  }
  if (user.role === 'partner') throw forbidden('not available to partners')
}

/** What the rider must supply, so the app never hardcodes the list. */
app.get('/requirements', requireAuth(), c => c.json({ documents: DOCUMENT_SPECS }))

app.get('/riders/:riderId/documents', requireAuth(), async c => {
  const riderId = c.req.param('riderId')
  assertMaySeeRider(c, riderId)
  const rider = await findRider(c.env, riderId)
  if (!rider) throw notFound('rider not found')
  const documents = await listRiderDocuments(c.env, riderId)
  return c.json({
    rider: { id: rider.id, name: rider.name, ownsBike: rider.ownsBike !== false },
    documents,
    // Computed fresh rather than read from the denormalised column, so the
    // rider sees the truth even if a sweep has not run since their last upload.
    // The grace window has to be passed or this disagrees with dispatch and
    // tells a rider they are blocked while the server still admits them.
    compliance: evaluateCompliance(documents, new Date(), rider.complianceGraceUntil),
  })
})

const uploadMeta = z.object({
  type: z.enum(DOC_TYPES),
  reference: z.string().max(80).optional(),
  issuedOn: z.string().optional(),
  expiresOn: z.string().optional(),
  notes: z.string().max(500).optional(),
})

app.post('/riders/:riderId/documents', requireAuth(), async c => {
  const riderId = c.req.param('riderId')
  assertMaySeeRider(c, riderId)
  if (!(await findRider(c.env, riderId))) throw notFound('rider not found')

  const form = await c.req.formData()
  const parsed = uploadMeta.safeParse({
    type: form.get('type'),
    reference: form.get('reference') || undefined,
    issuedOn: form.get('issuedOn') || undefined,
    expiresOn: form.get('expiresOn') || undefined,
    notes: form.get('notes') || undefined,
  })
  if (!parsed.success) throw badRequest('invalid document details', parsed.error.flatten())

  const spec = DOCUMENT_SPECS.find(d => d.type === parsed.data.type)!
  if (spec.expires && !parsed.data.expiresOn) {
    throw badRequest(`${spec.label} needs an expiry date — that is the whole point of tracking it.`)
  }

  const file = form.get('file')
  let fileKey: string | undefined
  let fileType: string | undefined
  // FormDataEntryValue is string | File in the Workers runtime, but the typed
  // shape here is a bare string, so this is checked structurally.
  const isFile = typeof file === 'object' && file !== null && 'size' in file && 'type' in file
  if (isFile && (file as File).size > 0) {
    try {
      const saved = await saveRiderDocument(c.env, riderId, parsed.data.type, file as File)
      fileKey = saved.s3Key
      fileType = (file as File).type
    } catch (err) {
      throw badRequest((err as Error).message)
    }
  } else {
    // A typed-in expiry date with no evidence behind it is not verification.
    throw badRequest('Attach a photo or PDF of the document.')
  }

  const doc = await upsertRiderDocument(c.env, riderId, { ...parsed.data, fileKey, fileType })
  const documents = await listRiderDocuments(c.env, riderId)
  const rider = await findRider(c.env, riderId)
  return c.json({
    document: doc,
    compliance: evaluateCompliance(documents, new Date(), rider?.complianceGraceUntil),
  }, 201)
})

/**
 * Streams the stored file.
 *
 * Proxied rather than handed out as a URL because these are identity
 * documents: the object key must never become a shareable link.
 */
app.get('/documents/:id/file', requireAuth(), async c => {
  const doc = await findRiderDocument(c.env, c.req.param('id'))
  if (!doc?.fileKey) throw notFound('no file for that document')
  assertMaySeeRider(c, doc.riderId)

  const obj = await c.env.PROOF_BUCKET.get(doc.fileKey)
  if (!obj) throw notFound('file missing from storage')

  return new Response(obj.body, {
    headers: {
      'Content-Type': doc.fileType ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      // Displayed inline for review, but never executed in our origin.
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

app.delete('/documents/:id', requireAuth(), async c => {
  const doc = await findRiderDocument(c.env, c.req.param('id'))
  if (!doc) throw notFound('document not found')
  assertMaySeeRider(c, doc.riderId)
  await softDeleteRiderDocument(c.env, doc.id)
  return c.json({ ok: true })
})

const verifySchema = z.object({
  status: z.enum(['verified', 'rejected']),
  rejectionReason: z.string().max(300).optional(),
})

app.put('/documents/:id/verify', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const body = verifySchema.parse(await c.req.json())
  if (body.status === 'rejected' && !body.rejectionReason?.trim()) {
    // A rejection without a reason gives the rider nothing to act on and
    // guarantees they upload the same thing again.
    throw badRequest('Give a reason so the rider knows what to fix.')
  }
  const user = c.get('user')!
  const doc = await setDocumentVerification(c.env, c.req.param('id'), {
    status: body.status,
    verifiedBy: user.email ?? user.sub,
    rejectionReason: body.rejectionReason,
  })
  return c.json(doc)
})

/** Headline counts for the dashboard tile. */
app.get('/overview', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const b = getBranchFilter(c)
  return c.json(await complianceOverview(c.env, b === '__ALL__' ? undefined : b))
})

/**
 * Every rider with their compliance state, for the console.
 *
 * Blocked riders sort first: they are the ones costing capacity right now.
 */
app.get('/riders', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const b = getBranchFilter(c)
  const riders = await listRiders(c.env, b === '__ALL__' ? undefined : b)

  const rows = await Promise.all(
    riders.map(async r => {
      const documents = await listRiderDocuments(c.env, r.id)
      const compliance = evaluateCompliance(documents, new Date(), r.complianceGraceUntil)
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        zone: r.zone,
        status: r.status,
        ownsBike: r.ownsBike !== false,
        bikeRegistration: r.bikeRegistration,
        compliance,
        documents: documents.map(d => ({
          id: d.id, type: d.type, status: d.status, expiresOn: d.expiresOn, reference: d.reference,
          rejectionReason: d.rejectionReason, hasFile: Boolean(d.fileKey),
        })),
      }
    }),
  )

  const rank = { blocked: 0, pending: 1, compliant: 2 } as const
  rows.sort((a, b2) =>
    rank[a.compliance.status] - rank[b2.compliance.status] ||
    (a.compliance.nextExpiry ?? '9999').localeCompare(b2.compliance.nextExpiry ?? '9999'),
  )
  return c.json({ riders: rows })
})

/** Forces a recheck. Useful after a bulk import or a manual database fix. */
app.post('/riders/:riderId/recheck', requireAuth(), requireRole('super-admin', 'manager'), async c => {
  const riderId = c.req.param('riderId')
  if (!(await findRider(c.env, riderId))) throw notFound('rider not found')
  return c.json(await recomputeRiderCompliance(c.env, riderId))
})

export default app
