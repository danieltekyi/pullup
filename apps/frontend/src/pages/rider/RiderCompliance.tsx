import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import type { ComplianceResult, DocumentSpec, RiderDocument } from '@pullup/shared'
import { api, apiErrorMessage } from '../../services/api'
import { Button, Card, toast } from '../../components/ui'

interface Payload {
  rider: { id: string; name: string; ownsBike: boolean }
  documents: RiderDocument[]
  compliance: ComplianceResult
}

/**
 * The rider's compliance screen.
 *
 * PullUp does not own the bikes, so it cannot insure them — it can only check
 * that the rider has, and stop giving work to anyone who has not. That makes
 * this screen the difference between a rider earning and a rider sitting idle,
 * which is why it leads with the consequence rather than a list of files.
 *
 * Built for a mid-range Android on patchy data: camera capture rather than a
 * file browser, one upload at a time, and every state legible without colour
 * alone.
 */
export default function RiderCompliance({ riderId }: { riderId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [specs, setSpecs] = useState<DocumentSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadFor, setUploadFor] = useState<DocumentSpec | null>(null)

  const load = useCallback(async () => {
    try {
      const [docs, reqs] = await Promise.all([
        api.get<Payload>(`/api/compliance/riders/${riderId}/documents`),
        api.get<{ documents: DocumentSpec[] }>('/api/compliance/requirements'),
      ])
      setData(docs.data)
      setSpecs(reqs.data.documents)
    } catch (err) {
      if (navigator.onLine) toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [riderId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    )
  }
  if (!data) return null

  const { compliance, documents } = data
  const docFor = (type: string) => documents.find(d => d.type === type)

  return (
    <div className="space-y-4">
      <StatusBanner compliance={compliance} />

      <div className="space-y-3">
        {specs.map(spec => (
          <DocumentRow
            key={spec.type}
            spec={spec}
            doc={docFor(spec.type)}
            onUpload={() => setUploadFor(spec)}
          />
        ))}
      </div>

      {uploadFor && (
        <UploadSheet
          riderId={riderId}
          spec={uploadFor}
          existing={docFor(uploadFor.type)}
          onClose={() => setUploadFor(null)}
          onDone={() => { setUploadFor(null); load() }}
        />
      )}
    </div>
  )
}

function StatusBanner({ compliance }: { compliance: ComplianceResult }) {
  if (compliance.status === 'blocked') {
    return (
      <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-red-600" size={22} />
          <div>
            <p className="font-bold text-red-900">You cannot be given rounds right now</p>
            <p className="mt-1 text-sm leading-relaxed text-red-800">{compliance.blockingReason}</p>
          </div>
        </div>
      </div>
    )
  }

  if (compliance.status === 'pending') {
    return (
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 shrink-0 text-amber-600" size={22} />
          <div>
            <p className="font-bold text-amber-900">We are checking your documents</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-800">
              Everything is in. You can keep taking rounds while we review — usually within a working day.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={22} />
        <div className="min-w-0">
          <p className="font-bold text-emerald-900">You are cleared to ride</p>
          {compliance.expiringSoon.length > 0 ? (
            <ul className="mt-1.5 space-y-1 text-sm text-emerald-900">
              {compliance.expiringSoon.map(e => (
                <li key={e.type}>
                  <span className="font-semibold">
                    {e.daysLeft === 0 ? 'Expires today' : e.daysLeft === 1 ? 'Expires tomorrow' : `${e.daysLeft} days left`}
                  </span>{' '}
                  — renew before {e.expiresOn.slice(0, 10)} or rounds stop.
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-emerald-800">All documents current. Nothing to do.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function DocumentRow({
  spec,
  doc,
  onUpload,
}: {
  spec: DocumentSpec
  doc?: RiderDocument
  onUpload: () => void
}) {
  const state = documentState(doc)

  return (
    <Card padded={false}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">
              {spec.label}
              {!spec.required && <span className="ml-2 text-xs font-normal text-slate-400">optional</span>}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{spec.why}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${state.chip}`}>
            {state.label}
          </span>
        </div>

        {doc?.expiresOn && (
          <p className="mt-3 text-sm text-slate-600">
            Expires <span className="font-semibold">{doc.expiresOn.slice(0, 10)}</span>
          </p>
        )}
        {doc?.rejectionReason && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            <span className="font-semibold">Not accepted:</span> {doc.rejectionReason}
          </p>
        )}

        <div className="mt-3">
          <Button
            variant={state.needsAction ? 'primary' : 'ghost'}
            size="sm"
            icon={<Camera size={14} />}
            onClick={onUpload}
          >
            {doc ? 'Replace' : 'Add document'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function documentState(doc?: RiderDocument): { label: string; chip: string; needsAction: boolean } {
  if (!doc) return { label: 'Not sent', chip: 'bg-slate-100 text-slate-600', needsAction: true }
  if (doc.status === 'rejected') return { label: 'Rejected', chip: 'bg-red-100 text-red-700', needsAction: true }
  // Checked before 'verified': a document approved last year and expired last
  // week is expired, whatever its stored status says.
  if (doc.expiresOn && Date.parse(doc.expiresOn) < Date.now()) {
    return { label: 'Expired', chip: 'bg-red-100 text-red-700', needsAction: true }
  }
  if (doc.status === 'verified') return { label: 'Verified', chip: 'bg-emerald-100 text-emerald-700', needsAction: false }
  return { label: 'Checking', chip: 'bg-amber-100 text-amber-700', needsAction: false }
}

function UploadSheet({
  riderId,
  spec,
  existing,
  onClose,
  onDone,
}: {
  riderId: string
  spec: DocumentSpec
  existing?: RiderDocument
  onClose: () => void
  onDone: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [reference, setReference] = useState(existing?.reference ?? '')
  const [expiresOn, setExpiresOn] = useState(existing?.expiresOn?.slice(0, 10) ?? '')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      toast.error('Take a photo of the document first.')
      return
    }
    if (spec.expires && !expiresOn) {
      toast.error('Enter the expiry date shown on the document.')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('type', spec.type)
      fd.append('file', file)
      if (reference) fd.append('reference', reference)
      if (expiresOn) fd.append('expiresOn', expiresOn)
      await api.post(`/api/compliance/riders/${riderId}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Sent. We will check it and let you know.')
      onDone()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <form
        onSubmit={submit}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{spec.label}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Issued by {spec.issuer}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-slate-500 active:bg-slate-100"
        >
          {file ? (
            <>
              <CheckCircle2 className="text-emerald-600" size={30} />
              <span className="max-w-full truncate px-4 text-sm font-medium text-slate-700">{file.name}</span>
              <span className="text-xs">Tap to choose a different one</span>
            </>
          ) : (
            <>
              <Camera size={30} />
              <span className="text-sm font-semibold">Take a photo of the document</span>
              <span className="text-xs">Or choose a PDF from your phone</span>
            </>
          )}
        </button>
        {/*
          `capture` asks Android to open the camera directly rather than a file
          browser, which is how a rider standing next to their bike will
          actually do this. PDF stays allowed for insurers that email one.
        */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="ref" className="text-sm font-semibold">
              Document number
            </label>
            <input
              id="ref"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="As printed on the document"
              className="input mt-1.5 w-full"
            />
          </div>
          {spec.expires && (
            <div>
              <label htmlFor="exp" className="text-sm font-semibold">
                Expiry date <span className="text-red-600">*</span>
              </label>
              <input
                id="exp"
                type="date"
                required
                value={expiresOn}
                onChange={e => setExpiresOn(e.target.value)}
                className="input mt-1.5 w-full"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                We will remind you a month before this date, and again as it gets close.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="ghost" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" fullWidth loading={busy} icon={<Upload size={15} />}>
            Send
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
          <FileText size={13} className="mt-0.5 shrink-0" />
          Only PullUp dispatch staff can see this. It is never shared with clients.
        </p>
      </form>
    </div>
  )
}
