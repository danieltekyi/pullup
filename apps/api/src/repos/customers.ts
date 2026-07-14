import type { Env } from '../env'
import { rowToObj } from '../lib/db'
import { newId, nowIso } from '../lib/ids'
import type { Customer } from '@pullup/shared'

const JSON_COLS = ['addresses']

export async function listCustomers(env: Env, branchId?: string): Promise<Customer[]> {
  const sql = branchId
    ? `SELECT * FROM customers WHERE branch_id = ? ORDER BY total_orders DESC LIMIT 500`
    : `SELECT * FROM customers ORDER BY total_orders DESC LIMIT 500`
  const stmt = branchId ? env.DB.prepare(sql).bind(branchId) : env.DB.prepare(sql)
  const res = await stmt.all<Record<string, unknown>>()
  return (res.results ?? []).map(r => rowToObj<Customer>(r, JSON_COLS)!)
}

export async function findCustomer(env: Env, id: string): Promise<Customer | undefined> {
  const row = await env.DB.prepare(`SELECT * FROM customers WHERE id = ?`).bind(id).first<Record<string, unknown>>()
  return rowToObj<Customer>(row, JSON_COLS)
}

export async function findCustomerByPhone(env: Env, branchId: string, phone: string): Promise<Customer | undefined> {
  const row = await env.DB.prepare(
    `SELECT * FROM customers WHERE branch_id = ? AND phone = ? LIMIT 1`,
  )
    .bind(branchId, phone)
    .first<Record<string, unknown>>()
  return rowToObj<Customer>(row, JSON_COLS)
}

export async function findOrCreateCustomer(env: Env, params: {
  branchId: string
  phone: string
  name: string
  address?: string
}): Promise<Customer> {
  const existing = await findCustomerByPhone(env, params.branchId, params.phone)
  if (existing) return existing

  const id = newId('cus')
  const now = nowIso()
  const addresses = params.address ? JSON.stringify([{ label: 'default', text: params.address }]) : null
  await env.DB.prepare(
    `INSERT INTO customers (id, branch_id, name, phone, addresses, total_orders, total_spent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
  )
    .bind(id, params.branchId, params.name, params.phone, addresses, now, now)
    .run()
  return (await findCustomer(env, id))!
}
