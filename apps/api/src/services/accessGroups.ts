import type { Env } from '../env'

interface AccessGroupRule {
  email?: { email: string }
  email_domain?: { domain: string }
  everyone?: Record<string, never>
  group?: { id: string }
}

interface AccessGroup {
  id: string
  name: string
  include: AccessGroupRule[]
}

/**
 * Add an email to the pullup-riders Cloudflare Access group.
 * The Worker holds CF_API_TOKEN as a secret to call the CF API.
 * Silently skips if CF_API_TOKEN is not set (dev mode).
 */
export async function addEmailToRidersGroup(env: Env, email: string): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!env.CF_API_TOKEN) {
    console.warn('CF_API_TOKEN not set — skipping Access group update')
    return { ok: false, skipped: true }
  }
  const H = {
    Authorization: `Bearer ${env.CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/groups/${env.CF_ACCESS_RIDERS_GROUP_ID}`

  // GET current group
  const get = await fetch(base, { headers: H })
  if (!get.ok) {
    console.error('Access group GET failed:', get.status)
    return { ok: false }
  }
  const data = (await get.json()) as { result: AccessGroup }
  const group = data.result

  // Check if email already in the group
  const already = group.include.some(r => r.email?.email === email.toLowerCase())
  if (already) return { ok: true }

  // Add the email rule
  group.include.push({ email: { email: email.toLowerCase() } })

  // PUT updated group
  const put = await fetch(base, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ name: group.name, include: group.include }),
  })
  if (!put.ok) {
    const body = await put.text()
    console.error('Access group PUT failed:', put.status, body)
    return { ok: false }
  }
  return { ok: true }
}

export async function removeEmailFromRidersGroup(env: Env, email: string): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!env.CF_API_TOKEN) return { ok: false, skipped: true }
  const H = {
    Authorization: `Bearer ${env.CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/groups/${env.CF_ACCESS_RIDERS_GROUP_ID}`

  const get = await fetch(base, { headers: H })
  if (!get.ok) return { ok: false }
  const data = (await get.json()) as { result: AccessGroup }
  const group = data.result

  const before = group.include.length
  group.include = group.include.filter(r => r.email?.email !== email.toLowerCase())
  if (group.include.length === before) return { ok: true } // wasn't in group

  const put = await fetch(base, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ name: group.name, include: group.include }),
  })
  return { ok: put.ok }
}
