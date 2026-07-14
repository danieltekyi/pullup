import type { Env } from '../../env'
import { newId } from '../../lib/ids'

export type UploadKind = 'signature' | 'photo'

const ALLOWED_MIME: Record<UploadKind, string[]> = {
  signature: ['image/png', 'image/jpeg'],
  photo: ['image/jpeg', 'image/png', 'image/webp'],
}
const MAX_BYTES: Record<UploadKind, number> = {
  signature: 512 * 1024,
  photo: 5 * 1024 * 1024,
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

export async function proofUrl(env: Env, s3Key: string): Promise<string | undefined> {
  const obj = await env.PROOF_BUCKET.head(s3Key)
  if (!obj) return undefined
  // R2 doesn't have built-in presigned URLs in Workers SDK; expose via a short
  // proxy route on the API (see routes/proofs.ts). Returning the API URL here.
  return `/api/proofs/${encodeURIComponent(s3Key)}`
}
