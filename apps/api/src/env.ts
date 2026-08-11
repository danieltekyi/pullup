export interface Env {
  // Bindings
  DB: D1Database
  PROOF_BUCKET: R2Bucket
  KV: KVNamespace

  // Vars
  FRONTEND_ADMIN_URL: string
  FRONTEND_RIDER_URL: string
  FRONTEND_CUSTOMER_URL: string
  ALLOWED_ORIGINS: string
  CF_ACCESS_TEAM_DOMAIN: string
  CF_ACCESS_AUD: string
  CF_ACCOUNT_ID: string
  CF_ACCESS_RIDERS_GROUP_ID: string
  /** Only this address may be auto-elevated to super-admin on first sign-in (DEF-014). */
  BOOTSTRAP_ADMIN_EMAIL?: string

  // Secrets (set via `wrangler secret put`)
  CF_API_TOKEN?: string   // for managing Access groups from the Worker

  // Secrets (set via `wrangler secret put`)
  TRACKER_LINK_SECRET: string
  /** Dedicated signing secrets — DEF-013. Falls back to TRACKER_LINK_SECRET when unset. */
  RIDER_SESSION_SECRET?: string
  PARTNER_SESSION_SECRET?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
  FROM_EMAIL?: string
  AT_USERNAME?: string
  AT_API_KEY?: string
  AT_SENDER_ID?: string
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_WHATSAPP_FROM?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
  GOOGLE_MAPS_API_KEY?: string
  TRACKER_API_URL?: string
  TRACKER_API_KEY?: string
}

import type { Role } from '@pullup/shared'

export interface AccessUser {
  email: string
  sub: string
  identityNonce?: string
}

export interface AppUser extends AccessUser {
  id: string
  name: string
  role: Role
  status: 'active' | 'inactive'
  branchId?: string
  managerId?: string
  riderId?: string
  /** Set for partner sessions — DEF-010 (was read by branchScope but never declared). */
  partnerId?: string
}

export type AppVariables = {
  user?: AppUser
  requestId: string
}
