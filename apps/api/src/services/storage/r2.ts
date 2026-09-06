import type { Env } from '../../env'
import { newId } from '../../lib/ids'

export type UploadKind = 'signature' | 'photo' | 'document'

const ALLOWED_MIME: Record<UploadKind, string[]> = {
  signature: ['image/png', 'image/jpeg'],
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  // Riders photograph a licence or insurance certificate on a phone; some send
  // a PDF from an insurer instead.
  document: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
}
const MAX_BYTES: Record<UploadKind, number> = {
  signature: 512 * 1024,
  photo: 5 * 1024 * 1024,
  document: 8 * 1024 * 1024,
}

export interface UploadResult {
  s3Key: string
  size: number
}

/**
 * Direct upload endpoint: rider posts a proof file as multipart/form-data.
 * Worker validates + puts to R2, returns the storage key.
 * Simpler than presigned URLs and only needs one HTTPS round trip.
 */
export async function saveProof(env: Env, kind: UploadKind, orderId: string, file: File): Promise<UploadResult> {
  if (!ALLOWED_MIME[kind].includes(file.type)) {
    throw new Error(`content type ${file.type} not allowed for ${kind}`)
  }
  if (file.size > MAX_BYTES[kind]) {
    throw new Error(`file too large for ${kind} (max ${MAX_BYTES[kind]} bytes)`)
  }
  const s3Key = `orders/${orderId}/${kind}/${newId('proof').slice(6)}-${sanitize(file.name)}`
  await env.PROOF_BUCKET.put(s3Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })
  return { s3Key, size: file.size }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
}

/**
 * Stores a rider's identity or compliance document.
 *
 * Kept under a separate prefix from delivery proofs because the sensitivity is
 * different: a proof-of-delivery photo is a parcel on a doorstep, whereas these
 * are licences, insurance certificates and national ID cards. Nothing here is
 * ever served publicly — reads go through an authorised route.
 */
export async function saveRiderDocument(
  env: Env,
  riderId: string,
  docType: string,
  file: File,
): Promise<UploadResult> {
  if (!ALLOWED_MIME.document.includes(file.type)) {
    throw new Error(`content type ${file.type} not allowed — send a photo or a PDF`)
  }
  if (file.size > MAX_BYTES.document) {
    throw new Error(`file too large (max ${Math.round(MAX_BYTES.document / 1024 / 1024)} MB)`)
  }
  const s3Key = `riders/${riderId}/documents/${docType}/${newId('doc').slice(4)}-${sanitize(file.name)}`
  await env.PROOF_BUCKET.put(s3Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })
  return { s3Key, size: file.size }
}

export async function proofUrl(env: Env, s3Key: string): Promise<string | undefined> {
  const obj = await env.PROOF_BUCKET.head(s3Key)
  if (!obj) return undefined
  // R2 doesn't have built-in presigned URLs in Workers SDK; expose via a short
  // proxy route on the API (see routes/proofs.ts). Returning the API URL here.
  return `/api/proofs/${encodeURIComponent(s3Key)}`
}
