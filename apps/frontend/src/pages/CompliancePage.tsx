import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react'
import type { ComplianceResult, DocumentSpec } from '@pullup/shared'
import { api, apiErrorMessage } from '../services/api'
import { Badge, Button, Card, Modal, toast } from '../components/ui'

interface RiderRow {
  id: string
  name: string
  phone: string
  zone: string
  status: string
  ownsBike: boolean
  bikeRegistration?: string
  compliance: ComplianceResult
  documents: Array<{
    id: string
    type: string
    status: string
    expiresOn?: string
    reference?: string
    rejectionReason?: string
    hasFile: boolean
  }>
}

type Filter = 'all' | 'blocked' | 'awaiting' | 'expiring'

/**
 * The dispatch-side view of rider compliance.
 *
 * Since PullUp stopped buying bikes, this page is what stands between the
 * business and sending an uninsured rider out with a client's parcel. Blocked
 * riders sort first because they are lost capacity right now, and the review
 * queue sits beside them because clearing it is usually how the capacity comes
 * back.
 */
export default function CompliancePage() {
  const [rows, setRows] = useState<RiderRow[]>([])
  const [specs, setSpecs] = useState<DocumentSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<RiderRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, reqs] = await Promise.all([
        api.get<{ riders: RiderRow[] }>('/api/compliance/riders'),
        api.get<{ documents: DocumentSpec[] }>('/api/compliance/requirements'),
      ])
      setRows(list.data.riders)
      setSpecs(reqs.data.documents)
      // Keeps an open drawer in step with the refreshed list rather than
      // showing a stale copy of the rider you just actioned.
      setOpen(prev => (prev ? list.data.riders.find(r => r.id === prev.id) ?? null : null))
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    blocked: rows.filter(r => r.compliance.status === 'blocked').length,
    awaiting: rows.filter(r => r.compliance.awaitingVerification.length > 0).length,
    expiring: rows.filter(r => r.compliance.expiringSoon.length > 0).length,
    compliant: rows.filter(r => r.compliance.status === 'compliant').length,
  }), [rows])

  const visible = useMemo(() => {
    if (filter === 'blocked') return rows.filter(r => r.compliance.status === 'blocked')
    if (filter === 'awaiting') return rows.filter(r => r.compliance.awaitingVerification.length > 0)
    if (filter === 'expiring') return rows.filter(r => r.compliance.expiringSoon.length > 0)
    return rows
  }, [rows, filter])

  /**
   * How much of the fleet can actually be dispatched.
   *
   * Deliberately not "documents collected". A rider with four of five
   * documents cannot be sent anywhere, so counting paperwork would flatter the
   * number that matters.
   */
  const readiness = rows.length
    ? Math.round(((rows.length - counts.blocked) / rows.length) * 100)
    : 100

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rider compliance</h1>
          <p className="mt-1 text-sm text-slate-500">
            Riders work their own bikes, so PullUp verifies cover rather than providing it.
            A rider whose documents lapse cannot be assigned work.
          </p>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} onClick={load}>
          Refresh
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Available to dispatch</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{readiness}%</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {rows.length - counts.blocked} of {rows.length} riders can be given work
            </p>
          </div>
          <div className="h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${readiness === 100 ? 'bg-emerald-500' : readiness >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${readiness}%` }}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Blocked" value={counts.blocked} tone="red" active={filter === 'blocked'} onClick={() => setFilter(filter === 'blocked' ? 'all' : 'blocked')} />
        <Tile label="Awaiting review" value={counts.awaiting} tone="amber" active={filter === 'awaiting'} onClick={() => setFilter(filter === 'awaiting' ? 'all' : 'awaiting')} />
        <Tile label="Expiring soon" value={counts.expiring} tone="orange" active={filter === 'expiring'} onClick={() => setFilter(filter === 'expiring' ? 'all' : 'expiring')} />
        <Tile label="Cleared" value={counts.compliant} tone="emerald" active={false} onClick={() => setFilter('all')} />
      </div>

      {visible.length === 0 && !loading && (
        <Card>
          <div className="py-12 text-center">
            <ShieldCheck className="mx-auto mb-3 text-slate-300" size={40} />
            <p className="text-slate-500">
              {filter === 'all' ? 'No riders yet.' : 'Nothing in this queue.'}
            </p>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {visible.map(r => (
          <Card key={r.id} padded={false}>
            <button onClick={() => setOpen(r)} className="w-full p-4 text-left hover:bg-slate-50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{r.name}</p>
                    <ComplianceChip status={r.compliance.status} />
                    {r.status === 'inactive' && <Badge variant="gray">inactive</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {r.zone} · {r.phone}
                    {r.bikeRegistration && ` · ${r.bikeRegistration}`}
                  </p>
                  {r.compliance.blockingReason && (
                    <p className="mt-2 text-sm font-medium text-red-700">{r.compliance.blockingReason}</p>
                  )}
                  {r.compliance.expiringSoon.length > 0 && (
                    <p className="mt-2 text-sm text-amber-700">
                      {r.compliance.expiringSoon[0].daysLeft <= 0
                        ? 'Expires today'
                        : `${r.compliance.expiringSoon[0].daysLeft} days until next expiry`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  {r.compliance.awaitingVerification.length > 0 && (
                    <Badge variant="amber">{r.compliance.awaitingVerification.length} to review</Badge>
                  )}
                  <Eye size={16} />
                </div>
              </div>
            </button>
          </Card>
        ))}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} size="lg">
        {open && <RiderDocuments rider={open} specs={specs} onChanged={load} />}
      </Modal>
    </div>
  )
}

function Tile({
  label, value, tone, active, onClick,
}: { label: string; value: number; tone: 'red' | 'amber' | 'orange' | 'emerald'; active: boolean; onClick: () => void }) {
  const tones = {
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 p-4 text-left transition-all ${tones[tone]} ${active ? 'ring-2 ring-offset-1 ring-slate-400' : 'hover:brightness-95'}`}
    >
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs font-semibold">{label}</p>
    </button>
  )
}

function ComplianceChip({ status }: { status: string }) {
  if (status === 'blocked') return <Badge variant="red">Blocked</Badge>
  if (status === 'pending') return <Badge variant="amber">In review</Badge>
  return <Badge variant="green">Cleared</Badge>
}

function RiderDocuments({
  rider, specs, onChanged,
}: { rider: RiderRow; specs: DocumentSpec[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  async function decide(id: string, status: 'verified' | 'rejected', rejectionReason?: string) {
    setBusy(id)
    try {
      await api.put(`/api/compliance/documents/${id}/verify`, { status, rejectionReason })
      toast.success(status === 'verified' ? 'Approved' : 'Rejected — the rider has been told why')
      setRejecting(null)
      setReason('')
      onChanged()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {rider.compliance.blockingReason && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-50 p-3.5">
          <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={18} />
          <p className="text-sm text-red-800">{rider.compliance.blockingReason}</p>
        </div>
      )}

      {specs.map(spec => {
        const doc = rider.documents.find(d => d.type === spec.type)
        const expired = doc?.expiresOn ? Date.parse(doc.expiresOn) < Date.now() : false

        return (
          <div key={spec.type} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">
                  {spec.label}
                  {!spec.required && <span className="ml-2 text-xs font-normal text-slate-400">optional</span>}
                </p>
                {doc?.reference && <p className="mt-0.5 font-mono text-xs text-slate-500">{doc.reference}</p>}
              </div>
              {!doc ? (
                <Badge variant="gray">Not supplied</Badge>
              ) : expired ? (
                <Badge variant="red">Expired {doc.expiresOn?.slice(0, 10)}</Badge>
              ) : doc.status === 'verified' ? (
                <Badge variant="green">Verified</Badge>
              ) : doc.status === 'rejected' ? (
                <Badge variant="red">Rejected</Badge>
              ) : (
                <Badge variant="amber">Awaiting review</Badge>
              )}
            </div>

            {doc?.expiresOn && !expired && (
              <p className="mt-2 text-sm text-slate-600">Expires {doc.expiresOn.slice(0, 10)}</p>
            )}
            {doc?.rejectionReason && (
              <p className="mt-2 text-sm text-red-700">Reason given: {doc.rejectionReason}</p>
            )}

            {doc && (
              <div className="mt-3 flex flex-wrap gap-2">
                {doc.hasFile && (
                  <a
                    href={`/api/compliance/documents/${doc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    <Eye size={13} /> View document
                  </a>
                )}
                {doc.status !== 'verified' && !expired && (
                  <Button
                    size="sm"
                    variant="success"
                    loading={busy === doc.id}
                    icon={<CheckCircle2 size={13} />}
                    onClick={() => decide(doc.id, 'verified')}
                  >
                    Approve
                  </Button>
                )}
                {doc.status !== 'rejected' && (
                  <Button size="sm" variant="danger" icon={<ShieldX size={13} />} onClick={() => setRejecting(doc.id)}>
                    Reject
                  </Button>
                )}
              </div>
            )}

            {rejecting === doc?.id && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <label htmlFor={`why-${doc.id}`} className="text-xs font-semibold text-slate-700">
                  Why? The rider sees this, so make it something they can act on.
                </label>
                <input
                  id={`why-${doc.id}`}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Photo is too blurred to read the expiry date"
                  className="input mt-2 w-full text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!reason.trim()}
                    loading={busy === doc.id}
                    onClick={() => decide(doc.id, 'rejected', reason.trim())}
                  >
                    Send rejection
                  </Button>
                  <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => { setRejecting(null); setReason('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!doc && <p className="mt-2 text-sm text-slate-500">{spec.why}</p>}
          </div>
        )
      })}

      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-400">
        <Clock size={13} className="mt-0.5 shrink-0" />
        Riders are reminded automatically at 30, 14, 7, 3 and 1 days before a document expires.
        On the day it lapses they are blocked and dispatch is told.
      </p>
    </div>
  )
}
