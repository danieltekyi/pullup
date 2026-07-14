import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export interface TrackerTokenPayload {
  bikeId: string
  orderId: string
  logoUrl?: string
}

export function signTrackerToken(payload: TrackerTokenPayload, expiresInSeconds = 3600): string {
  return jwt.sign(payload, env.TRACKER_LINK_SECRET, { expiresIn: expiresInSeconds, algorithm: 'HS256' })
}

export function verifyTrackerToken(token: string): TrackerTokenPayload {
  return jwt.verify(token, env.TRACKER_LINK_SECRET, { algorithms: ['HS256'] }) as TrackerTokenPayload
}

export function buildTrackerUrl(token: string): string {
  return `${env.FRONTEND_BASE_URL}/track?token=${encodeURIComponent(token)}`
}
