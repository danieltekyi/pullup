/**
 * Rider compliance for the owner-operator model.
 *
 * PullUp does not own the bikes. Riders work their own machines, which means
 * the company cannot control whether a bike is insured or roadworthy — it can
 * only verify it, and refuse work when it cannot. Ghana requires third-party
 * motor insurance and a roadworthy certificate to run a vehicle commercially,
 * so dispatching an uninsured rider is not a policy failure but a legal one.
 *
 * These rules live in shared so the rider app, the dispatch console and the
 * server all answer "is this rider allowed to work" identically. A rule the UI
 * enforces and the server does not is decoration.
 */

export type DocumentType =
  | 'rider_licence'
  | 'motor_insurance'
  | 'roadworthy'
  | 'ghana_card'
  | 'bike_registration'

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired'

export type ComplianceStatus = 'compliant' | 'pending' | 'blocked'

export interface DocumentSpec {
  type: DocumentType
  label: string
  /** Why the rider is being asked for it. Shown in the app. */
  why: string
  /** A rider without this cannot be assigned work. */
  required: boolean
  /** False for documents that do not lapse, such as a Ghana Card. */
  expires: boolean
  issuer: string
}

export const DOCUMENT_SPECS: DocumentSpec[] = [
  {
    type: 'rider_licence',
    label: "Rider's licence",
    why: 'Confirms you are licensed to ride the class of bike you deliver on.',
    required: true,
    expires: true,
    issuer: 'DVLA Ghana',
  },
  {
    type: 'motor_insurance',
    label: 'Motor insurance',
    why: 'Third-party cover is required by law in Ghana. Without it neither you nor PullUp is protected if something goes wrong on a round.',
    required: true,
    expires: true,
    issuer: 'Your insurer',
  },
  {
    type: 'roadworthy',
    label: 'Roadworthy certificate',
    why: 'Required to run a vehicle commercially, and it is what stands between a mechanical fault and a serious injury.',
    required: true,
    expires: true,
    issuer: 'DVLA Ghana',
  },
  {
    type: 'ghana_card',
    label: 'Ghana Card',
    why: 'Confirms your identity. We hold parcels of real value and clients ask who is carrying them.',
    required: true,
    expires: false,
    issuer: 'NIA',
  },
  {
    type: 'bike_registration',
    label: 'Bike registration',
    why: 'Ties the bike you ride to you. Only needed if the bike is registered in your name.',
    required: false,
    expires: false,
    issuer: 'DVLA Ghana',
  },
]

export const REQUIRED_DOCUMENT_TYPES: DocumentType[] = DOCUMENT_SPECS.filter(d => d.required).map(d => d.type)

export function documentSpec(type: DocumentType): DocumentSpec | undefined {
  return DOCUMENT_SPECS.find(d => d.type === type)
}

/** Days before expiry at which a document is treated as needing renewal. */
export const EXPIRY_WARNING_DAYS = 30

export interface RiderDocumentLike {
  type: DocumentType | string
  status: DocumentStatus | string
  expiresOn?: string | null
}

function daysUntil(iso: string | null | undefined, now: Date): number | undefined {
  if (!iso) return undefined
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return undefined
  return Math.floor((then - now.getTime()) / 86_400_000)
}

/** True once the date has passed. A document expiring today is still valid. */
export function isExpired(expiresOn: string | null | undefined, now: Date = new Date()): boolean {
  const d = daysUntil(expiresOn, now)
  return d !== undefined && d < 0
}

export function isExpiringSoon(
  expiresOn: string | null | undefined,
  now: Date = new Date(),
  withinDays = EXPIRY_WARNING_DAYS,
): boolean {
  const d = daysUntil(expiresOn, now)
  return d !== undefined && d >= 0 && d <= withinDays
}

export interface ComplianceResult {
  status: ComplianceStatus
  /** Required documents never supplied. */
  missing: DocumentType[]
  /** Supplied and past their expiry date. */
  expired: DocumentType[]
  /** Supplied but not yet checked by a human. */
  awaitingVerification: DocumentType[]
  /** Verified and refused. */
  rejected: DocumentType[]
  /** Valid, but lapsing within the warning window. */
  expiringSoon: { type: DocumentType; expiresOn: string; daysLeft: number }[]
  /** Earliest expiry across required documents, for sorting a work queue. */
  nextExpiry?: string
  /** Plain-language reason a blocked rider cannot be assigned work. */
  blockingReason?: string
  /** Set while a rider is inside a grace window and not yet blocked. */
  graceUntil?: string
}

/**
 * Whether a rider may be given work, and why not if not.
 *
 * Returns the whole picture rather than a boolean because every caller needs a
 * different part of it: dispatch needs the blocking reason, the rider app needs
 * the to-do list, the console needs what lapses next.
 *
 * `graceUntil` exists for one specific and important case. When this model was
 * introduced, every existing rider had zero documents on file. Evaluating them
 * strictly would have blocked the entire fleet the instant anything recomputed
 * — and worse, the first rider to upload a document would have triggered their
 * own block for trying to comply. A grace window lets a working fleet keep
 * working while it catches up. It applies only to documents never supplied;
 * expired cover and rejected documents block immediately, because a grace
 * period on lapsed insurance would defeat the purpose of checking.
 */
export function evaluateCompliance(
  documents: RiderDocumentLike[],
  now: Date = new Date(),
  graceUntil?: string | null,
): ComplianceResult {
  const missing: DocumentType[] = []
  const expired: DocumentType[] = []
  const awaitingVerification: DocumentType[] = []
  const rejected: DocumentType[] = []
  const expiringSoon: ComplianceResult['expiringSoon'] = []
  const expiries: string[] = []

  for (const type of REQUIRED_DOCUMENT_TYPES) {
    const doc = documents.find(d => d.type === type)
    if (!doc) {
      missing.push(type)
      continue
    }
    if (doc.status === 'rejected') {
      rejected.push(type)
      continue
    }
    // Checked before status, because a verified document that has since lapsed
    // is expired regardless of having once been approved.
    if (isExpired(doc.expiresOn, now)) {
      expired.push(type)
      continue
    }
    if (doc.status !== 'verified') {
      awaitingVerification.push(type)
      continue
    }
    if (doc.expiresOn) {
      expiries.push(doc.expiresOn)
      const daysLeft = daysUntil(doc.expiresOn, now)
      if (daysLeft !== undefined && daysLeft <= EXPIRY_WARNING_DAYS) {
        expiringSoon.push({ type, expiresOn: doc.expiresOn, daysLeft })
      }
    }
  }

  const label = (t: DocumentType) => documentSpec(t)?.label ?? t
  const list = (t: DocumentType[]) => t.map(label).join(', ')

  // Grace covers documents never supplied, and nothing else. Expired cover is
  // expired whatever the calendar says about onboarding.
  const inGrace = Boolean(graceUntil && Date.parse(graceUntil) > now.getTime())
  const graceDaysLeft = graceUntil
    ? Math.ceil((Date.parse(graceUntil) - now.getTime()) / 86_400_000)
    : 0

  let status: ComplianceStatus = 'compliant'
  let blockingReason: string | undefined

  // Ordered by how the rider should fix it, so the message names the most
  // actionable problem rather than the first one found.
  if (expired.length) {
    status = 'blocked'
    blockingReason = `Expired: ${list(expired)}. Renew and upload the new document before taking work.`
  } else if (rejected.length) {
    status = 'blocked'
    blockingReason = `Not accepted: ${list(rejected)}. Check the reason given and upload again.`
  } else if (missing.length) {
    if (inGrace) {
      status = 'pending'
      blockingReason =
        `Still needed: ${list(missing)}. ` +
        `You can keep riding for ${graceDaysLeft} more day${graceDaysLeft === 1 ? '' : 's'}, ` +
        'then rounds stop until these are uploaded.'
    } else {
      status = 'blocked'
      blockingReason = `Not yet supplied: ${list(missing)}.`
    }
  } else if (awaitingVerification.length) {
    // Deliberately not blocked. The rider has done their part and is waiting on
    // PullUp; blocking here would punish them for our queue. Dispatch sees the
    // pending state and decides.
    status = 'pending'
  }

  return {
    status,
    missing,
    expired,
    awaitingVerification,
    rejected,
    expiringSoon: expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft),
    nextExpiry: expiries.sort()[0],
    blockingReason,
    graceUntil: inGrace ? graceUntil ?? undefined : undefined,
  }
}

/**
 * Whether a rider may be assigned a delivery.
 *
 * 'pending' passes: the rider has supplied everything and is waiting on our
 * review. 'blocked' does not, and that is the case with legal weight — an
 * uninsured rider carrying a client's parcel is the company's problem.
 */
export function canBeAssignedWork(status: ComplianceStatus | string): boolean {
  return status !== 'blocked'
}
