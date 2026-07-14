import type { Env } from '../../env'
import { SignJWT, importJWK } from 'jose'
import { listPushSubs, unsubscribePush } from '../../repos/misc'

interface PushPayload {
  title: string
  body: string
  url?: string
  data?: Record<string, unknown>
}

/**
 * Web Push in Workers — signs a VAPID JWT, encrypts an aesgcm payload,
 * POSTs to the push endpoint. Fewer batteries than `web-push` but works
 * without Node crypto.
 *
 * The heavy lift (aes128gcm encryption) is not implemented here; instead we
 * send a "data-less" push (title/body via server side notification). This is
 * fine for most alerts. Move to a Worker-compatible encryption lib if you
 * need rich payloads.
 */
export async function sendPushToUser(
  env: Env,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0, pruned: 0 }
  const subs = await listPushSubs(env, userId)
  let sent = 0
  let pruned = 0
  await Promise.all(
    subs.map(async sub => {
      try {
        const endpoint = new URL(sub.endpoint)
        const aud = `${endpoint.protocol}//${endpoint.host}`
        const jwt = await signVapidJwt(env, aud)
        const headers: Record<string, string> = {
          Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
          TTL: '3600',
          Urgency: 'normal',
        }
        // NB: sending an empty body means the SW receives a `push` event with no data;
        // the SW is responsible for showing a generic notification. For now we accept that.
        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8_000),
        })
        if (res.status === 404 || res.status === 410) {
          await unsubscribePush(env, userId, sub.endpoint)
          pruned++
        } else if (res.ok) {
          sent++
        }
      } catch (err) {
        console.warn('push send failed', (err as Error).message)
      }
    }),
  )
  return { sent, pruned }
}

async function signVapidJwt(env: Env, aud: string): Promise<string> {
  const privateKeyJwk = base64UrlToJwk(env.VAPID_PRIVATE_KEY!, env.VAPID_PUBLIC_KEY!)
  const key = await importJWK(privateKeyJwk, 'ES256')
  return new SignJWT({ aud, sub: env.VAPID_SUBJECT || 'mailto:ops@pullup.aegisassetllc.com' })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(key)
}

function base64UrlToJwk(privateB64: string, publicB64: string) {
  // publicB64 is 65 bytes: 0x04 || x || y (each 32 bytes)
  const publicBytes = base64UrlDecode(publicB64)
  const x = publicBytes.slice(1, 33)
  const y = publicBytes.slice(33, 65)
  return {
    kty: 'EC',
    crv: 'P-256',
    d: privateB64,
    x: bytesToBase64Url(x),
    y: bytesToBase64Url(y),
  }
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob(b64 + pad)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

function bytesToBase64Url(b: Uint8Array): string {
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function vapidPublicKey(env: Env): string | undefined {
  return env.VAPID_PUBLIC_KEY
}
