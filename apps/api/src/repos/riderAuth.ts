// Helper queries used by the rider auth route.
// Looks up users by phone or email for the rider sign-in flow.

import type { Env } from '../env'
import { rowToObj } from '../lib/db'

export interface RiderAuthUser {
  id: string
  email?: string
  name: string
  role: string
  status: string
  branchId?: string
  riderId?: string
}

export async function findUserByPhone(env: Env, phone: string): Promise<RiderAuthUser | null> {
  // Riders are in the `riders` table with a phone column. We find the rider
  // by phone, then look up their linked user row.
  const rider = await env.DB.prepare(
    `SELECT id FROM riders WHERE phone = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(phone)
    .first<{ id: string }>()

  if (!rider) return null

  const user = await env.DB.prepare(
    `SELECT id, email, name, role, status, branch_id, rider_id FROM users WHERE rider_id = ? LIMIT 1`,
  )
    .bind(rider.id)
    .first<Record<string, unknown>>()

  if (!user) return null
  const u = rowToObj<{ id: string; email?: string; name: string; role: string; status: string; branchId?: string; riderId?: string }>(user)
  return u ?? null
}

export async function findUserByEmail(env: Env, email: string): Promise<RiderAuthUser | null> {
  const row = await env.DB.prepare(
    `SELECT id, email, name, role, status, branch_id, rider_id FROM users WHERE email = ? LIMIT 1`,
  )
    .bind(email.toLowerCase())
    .first<Record<string, unknown>>()

  if (!row) return null
  const u = rowToObj<{ id: string; email?: string; name: string; role: string; status: string; branchId?: string; riderId?: string }>(row)
  return u ?? null
}
