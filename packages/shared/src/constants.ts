import type { OrderStatus, Role } from './types.js'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  awaiting_confirmation: 'Awaiting Confirmation',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  failed: 'Failed',
  returned: 'Returned',
  cancelled: 'Cancelled',
}

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'pending', 'cancelled'],
  picked_up: ['in_transit', 'delivered', 'failed'],
  in_transit: ['delivered', 'failed'],
  delivered: ['awaiting_confirmation', 'confirmed'],
  awaiting_confirmation: ['confirmed', 'rejected'],
  confirmed: [],
  rejected: ['assigned'],
  failed: ['assigned', 'returned', 'cancelled'],
  returned: [],
  cancelled: [],
}

/** States an order can never leave. */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['confirmed', 'returned', 'cancelled']

/** Hours allowed for a delivery before it counts as late, by priority. */
export const SLA_HOURS_BY_PRIORITY: Record<string, number> = {
  urgent: 3,
  normal: 8,
  low: 24,
}

/**
 * The deadline a delivery is measured against.
 *
 * sla_by has always been an optional field on the create request, and in
 * practice no caller ever supplied one — every order in the database had a null
 * deadline. A column nothing writes cannot be a column anything watches, so
 * "we have SLA tracking" was true only in the schema.
 *
 * Defaulting it here rather than in a route means every creation path gets one:
 * the admin console, customer self-serve, and partner feed imports alike.
 */
export function defaultSlaBy(priority: string | undefined, from: Date = new Date()): string {
  const hours = SLA_HOURS_BY_PRIORITY[priority ?? 'normal'] ?? SLA_HOURS_BY_PRIORITY.normal
  return new Date(from.getTime() + hours * 3_600_000).toISOString()
}

/**
 * Whether an order may move from one status to another.
 *
 * Re-applying the current status counts as legal: a rider on a poor connection
 * retrying the same request should get the order back rather than an error.
 *
 * This lives beside the flow it enforces because for a long time the flow was
 * declared here and checked nowhere, which let an order jump straight from
 * pending to delivered — leaving assigned_at and picked_up_at null on a
 * delivered order and quietly corrupting any duration measured from them.
 */
export function isLegalTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true
  return (ORDER_STATUS_FLOW[from] ?? []).includes(to)
}

/** Human-readable list of where an order can go next, for error messages. */
export function describeNextStatuses(from: OrderStatus): string {
  const allowed = ORDER_STATUS_FLOW[from] ?? []
  return allowed.length
    ? allowed.map(s => ORDER_STATUS_LABELS[s]).join(', ')
    : 'nothing — this is a final state'
}

export const ROLES: Role[] = ['super-admin', 'manager', 'rider', 'partner']

export const COGNITO_GROUPS = {
  SUPER_ADMIN: 'super-admin',
  MANAGER: 'manager',
  RIDER: 'rider',
} as const

export const MENU_KEYS = [
  'dashboard',
  'orders',
  'riders',
  'fleet',
  'partners',
  'finance',
  'customers',
  'users',
  'branches',
  'params',
  'zones',
  'physics',
  'settings',
  'audit',
] as const

export type MenuKey = (typeof MENU_KEYS)[number]

export const RESOURCE_KEYS = [
  'orders',
  'riders',
  'fleet',
  'partners',
  'finance',
  'customers',
  'users',
  'branches',
  'params',
  'zones',
] as const

export type ResourceKey = (typeof RESOURCE_KEYS)[number]

export const ACTIONS = ['create', 'read', 'update', 'delete'] as const
export type Action = (typeof ACTIONS)[number]
