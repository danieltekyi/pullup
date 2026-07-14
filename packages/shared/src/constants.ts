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

export const ROLES: Role[] = ['super-admin', 'manager', 'rider']

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
