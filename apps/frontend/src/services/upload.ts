import { api } from './api'

/**
 * Upload a Blob to a presigned S3 URL. Returns the S3 key on success.
 * Server returns { uploadUrl, s3Key, expiresInSeconds }.
 */
export async function uploadProof(
  orderId: string,
  kind: 'signature' | 'photo',
  blob: Blob,
): Promise<string> {
  const presign = await api.post<{ uploadUrl: string; s3Key: string; expiresInSeconds: number }>(
    `/api/orders/${orderId}/upload-url`,
    { kind, contentType: blob.type || 'application/octet-stream', contentLength: blob.size },
  )
  const res = await fetch(presign.data.uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
  })
  if (!res.ok) throw new Error(`upload failed: ${res.status}`)
  return presign.data.s3Key
}
