export type Role = 'super-admin' | 'manager' | 'rider' | 'partner'

export type OrderStatus =
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'failed'
  | 'returned'
  | 'cancelled'

export type FailureReason =
  | 'recipient_not_home'
  | 'wrong_address'
  | 'refused'
  | 'damaged'
  | 'unreachable'
  | 'other'

export type RevenueStatus = 'none' | 'suspense' | 'receivable' | 'paid' | 'writeoff'

export type Priority = 'low' | 'normal' | 'urgent'

export type PaymentMethod = 'prepaid' | 'cod' | 'invoice'

export interface AuditActor {
  sub: string
  email?: string
  role: Role
  ip?: string
}

export interface ProofOfDelivery {
  receiverName?: string
  signatureS3Key?: string
  photoS3Key?: string
  gps?: { lat: number; lng: number; accuracy?: number; capturedAt: string }
  timestamp: string
}

export interface Order {
  id: string
  branchId: string
  status: OrderStatus
  priority: Priority

  // Customer + destination
  customerId?: string
  customerName: string
  customerPhone?: string
  destination: string
  destinationZone?: string
  originZone?: string

  // Parcel
  weight?: number
  parcelCount?: number
  description?: string

  // Pricing
  cost?: number
  pricingMode?: 'zone' | 'physics' | 'manual'
  paymentMethod: PaymentMethod
  codCollected?: number

  // Assignment
  assignedTo?: string
  assignedAt?: string
  bikeId?: string

  // Lifecycle timestamps
  slaBy?: string
  pickedUpAt?: string
  deliveredAt?: string
  confirmedAt?: string
  rejectedAt?: string
  failedAt?: string
  failureReason?: FailureReason
  failureNote?: string

  // Proof
  proof?: ProofOfDelivery

  // Partner
  partnerId?: string
  partnerOrderId?: string
  deliveryFeeFromPartner?: number
  revenueStatus: RevenueStatus

  // Audit
  createdAt: string
  updatedAt: string
  createdBy?: string
  deletedAt?: string
  version: number
}

export type OrderEventType =
  | 'created'
  | 'imported'
  | 'priced'
  | 'assigned'
  | 'reassigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'failed'
  | 'cancelled'
  | 'proof_uploaded'
  | 'cod_collected'
  | 'partner_notified'
  | 'note_added'

export interface OrderEvent {
  id: string
  orderId: string
  type: OrderEventType
  actor: AuditActor
  at: string
  before?: Partial<Order>
  after?: Partial<Order>
  note?: string
  metadata?: Record<string, unknown>
}

export interface Rider {
  id: string
  cognitoSub?: string
  name: string
  phone: string
  email?: string
  zone: string
  branchId: string
  managerId?: string
  status: 'active' | 'inactive' | 'on_delivery'
  vehicleId?: string
  ratePerDelivery?: number
  ratePctOfFee?: number
  documents?: Array<{ type: string; expiry: string; s3Key?: string }>
  /** Owner-operator model: the rider works their own machine. */
  ownsBike?: boolean
  bikeRegistration?: string
  bikeMake?: string
  bikeModel?: string
  /**
   * Denormalised from rider_documents so dispatch is a single read. Written by
   * the server on every document change and by the expiry sweep — never set
   * from a client.
   */
  complianceStatus?: 'compliant' | 'pending' | 'blocked'
  complianceCheckedAt?: string
  complianceExpiresOn?: string
  /**
   * While set and in the future, missing documents warn instead of blocking.
   * Used to onboard an existing fleet without grounding it overnight. Never
   * applies to expired or rejected documents.
   */
  complianceGraceUntil?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
  version: number
}

export interface RiderDocument {
  id: string
  riderId: string
  type: string
  reference?: string
  issuedOn?: string
  expiresOn?: string
  /** R2 key. Never a public URL — these are identity documents. */
  fileKey?: string
  fileType?: string
  status: 'pending' | 'verified' | 'rejected' | 'expired'
  verifiedBy?: string
  verifiedAt?: string
  rejectionReason?: string
  notes?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
  version: number
}

export interface Vehicle {
  id: string
  branchId: string
  make: string
  model: string
  registration: string
  status: 'available' | 'in_use' | 'maintenance' | 'retired'
  trackerConfig?: { deviceId?: string; provider?: string }
  insuranceExpiry?: string
  licenseExpiry?: string
  odometerKm?: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
  version: number
}

export interface Customer {
  id: string
  branchId: string
  name: string
  phone: string
  email?: string
  addresses: Array<{ label: string; text: string; lat?: number; lng?: number; zone?: string }>
  totalOrders: number
  totalSpent: number
  lastOrderAt?: string
  createdAt: string
  updatedAt: string
}

export interface Partner {
  id: string
  branchId?: string
  name: string
  getUrl?: string
  putUrlTemplate?: string
  apiKey?: string
  webhookSecret?: string
  active: boolean
  lastFetchedAt?: string
  createdAt: string
  updatedAt: string
  version: number
}

export interface Expenditure {
  id: string
  branchId: string
  category: 'fuel' | 'maintenance' | 'salary' | 'rent' | 'utility' | 'other'
  description: string
  amount: number
  date: string
  vehicleId?: string
  riderId?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
  version: number
}

export interface Branch {
  id: string
  name: string
  city: string
  country: string
  currency: 'KES' | 'GHS' | 'USD' | 'NGN' | 'ZAR'
  timezone: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type SyncActionType = 'assign' | 'status' | 'confirm' | 'reject' | 'fail' | 'cod' | 'proof'

export interface SyncAction {
  clientActionId: string
  type: SyncActionType
  orderId: string
  payload: Record<string, unknown>
  queuedAt: string
}

export interface SyncResult {
  clientActionId: string
  ok: boolean
  reason?: string
  order?: Order
}

export interface PaginatedResponse<T> {
  items: T[]
  cursor?: string
  total?: number
}
