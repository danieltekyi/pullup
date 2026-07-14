import { SignJWT, jwtVerify } from 'jose'
import type { Env } from '../env'

export interface TrackerPayload {
  bikeId: string
  orderId: string
  logoUrl?: string
}

async function key(env: Env) {
  return new TextEncoder().encode(env.TRACKER_LINK_SECRET)
}

export async function signTrackerToken(env: Env, payload: TrackerPayload, expSeconds = 3600): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expSeconds}s`)
    .sign(await key(env))
}

export async function verifyTrackerToken(env: Env, token: string): Promise<TrackerPayload> {
  const { payload } = await jwtVerify(token, await key(env), { algorithms: ['HS256'] })
  return payload as unknown as TrackerPayload
}

export function buildTrackerUrl(env: Env, token: string): string {
  return `${env.FRONTEND_CUSTOMER_URL}/track?token=${encodeURIComponent(token)}`
}
