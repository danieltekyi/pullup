import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../../config/env.js'
import { randomUUID } from 'crypto'

const s3 = new S3Client({ region: env.AWS_REGION })

export type UploadKind = 'signature' | 'photo' | 'rider-doc'

const ALLOWED_MIME: Record<UploadKind, string[]> = {
  signature: ['image/png', 'image/jpeg'],
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  'rider-doc': ['image/jpeg', 'image/png', 'application/pdf'],
}

const MAX_BYTES: Record<UploadKind, number> = {
  signature: 512 * 1024,
  photo: 5 * 1024 * 1024,
  'rider-doc': 10 * 1024 * 1024,
}

export interface PresignedPost {
  uploadUrl: string
  s3Key: string
  expiresInSeconds: number
}

export async function presignUpload(params: {
  kind: UploadKind
  orderId?: string
  contentType: string
  contentLength: number
}): Promise<PresignedPost> {
  if (!ALLOWED_MIME[params.kind].includes(params.contentType)) {
    throw new Error(`content type ${params.contentType} not allowed for ${params.kind}`)
  }
  if (params.contentLength > MAX_BYTES[params.kind]) {
    throw new Error(`file too large for ${params.kind}`)
  }
  const prefix = params.orderId ? `orders/${params.orderId}/${params.kind}` : params.kind
  const s3Key = `${prefix}/${randomUUID()}`

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: env.BUCKET_PROOF,
      Key: s3Key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
      ServerSideEncryption: 'AES256',
    }),
    { expiresIn: 300 },
  )

  return { uploadUrl, s3Key, expiresInSeconds: 300 }
}
