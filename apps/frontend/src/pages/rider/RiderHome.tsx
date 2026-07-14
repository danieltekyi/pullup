import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, MapPin, Package, RefreshCw, WifiOff, LogOut, PenLine, AlertTriangle } from 'lucide-react'
import SignatureCanvas from 'react-signature-canvas'
import type { Order } from '@pullup/shared'
import { api, apiErrorMessage } from '../../services/api'
import { enqueue } from '../../offline/queue'
import { pendingCount, syncQueue } from '../../offline/sync'
import { uploadProof } from '../../services/upload'
import { subscribeToPush } from '../../services/push'
import { Button, Card, Field, Input, Modal, StatusBadge, toast } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

export default function RiderHome() {
  const { user, logout } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [detail, setDetail] = useState<Order | null>(null)
  const [proofOpen, setProofOpen] = useState<{ order: Order; kind: 'delivered' | 'failed' } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ items: Order[] }>('/api/orders?status=assigned,picked_up,in_transit')
      setOrders(res.data.items)
    } catch (err) {
      if (navigator.onLine) toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
      setPending(await pendingCount())
    }
  }

  useEffect(() => {
    load()
    const onOnline = () => { setOnline(true); syncQueue().then(load) }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    subscribeToPush().catch(() => undefined)
    const iv = setInterval(load, 60_000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(iv)
    }
  }, [])

  async function markStatus(order: Order, status: Order['status']) {
    try {
      if (navigator.onLine) {
        await api.put(`/api/orders/${order.id}/status`, { status })
        toast.success(`Marked as ${status.replace(/_/g, ' ')}`)
      } else {
        await enqueue({ type: 'status', orderId: order.id, payload: { status } })
        toast.info('Queued — will sync when online')
      }
      load()
    } catch (err) {
      await enqueue({ type: 'status', orderId: order.id, payload: { status } })
      toast.warning('Saved offline: ' + apiErrorMessage(err))
      load()
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="text-brand-600" size={22} />
          <div>
            <p className="font-bold text-slate-900">{user?.name}</p>
            <p className="text-xs text-slate-500">Rider</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!online && (
            <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-semibold">
              <WifiOff size={12} /> Offline
            </span>
          )}
          {pending > 0 && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-semibold">
              {pending} to sync
            </span>
          )}
          <button onClick={logout} className="text-slate-400 p-2" aria-label="sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">
            Today's deliveries <span className="text-slate-400">({orders.length})</span>
          </h1>
          <button onClick={load} aria-label="refresh" className="text-slate-500">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {orders.length === 0 && !loading && (
          <div className="text-center py-16">
            <Package className="mx-auto text-slate-300" size={40} />
            <p className="text-slate-500 mt-3">Nothing assigned yet. Enjoy the break.</p>
          </div>
        )}

        <div className="space-y-3">
          {orders.map(o => (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-slate-900">{o.customerName}</p>
                  {o.customerPhone && (
                    <a href={`tel:${o.customerPhone}`} className="text-sm text-brand-600">
                      {o.customerPhone}
                    </a>
                  )}
                </div>
                <StatusBadge status={o.status} />
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.destination)}`}
                target="_blank"
                rel="noopener"
                className="flex items-start gap-2 text-sm text-slate-700 mb-3 hover:text-brand-600"
              >
                <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                <span>{o.destination}</span>
              </a>

              {o.cost && (
                <p className="text-xs text-slate-500 mb-3">
                  Fee: <strong>{o.cost.toLocaleString()}</strong>
                  {o.paymentMethod === 'cod' && <span className="ml-2 text-amber-700">COD</span>}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {o.status === 'assigned' && (
                  <Button size="md" fullWidth onClick={() => markStatus(o, 'picked_up')}>
                    Picked up
                  </Button>
                )}
                {(o.status === 'picked_up' || o.status === 'in_transit') && (
                  <>
                    <Button size="md" variant="success" onClick={() => setProofOpen({ order: o, kind: 'delivered' })}>
                      Delivered
                    </Button>
                    <Button size="md" variant="danger" onClick={() => setProofOpen({ order: o, kind: 'failed' })}>
                      Failed
                    </Button>
                  </>
                )}
                <Button size="md" variant="ghost" onClick={() => setDetail(o)}>
                  Details
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Order details">
        {detail && <RiderOrderDetail order={detail} />}
      </Modal>

      {proofOpen && (
        <ProofModal
          order={proofOpen.order}
          kind={proofOpen.kind}
          onClose={() => setProofOpen(null)}
          onDone={() => {
            setProofOpen(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function RiderOrderDetail({ order }: { order: Order }) {
  return (
    <div className="space-y-3 text-sm">
      <p><span className="font-semibold">ID:</span> {order.id}</p>
      <p><span className="font-semibold">Destination:</span> {order.destination}</p>
      {order.description && <p><span className="font-semibold">Notes:</span> {order.description}</p>}
      {order.weight && <p><span className="font-semibold">Weight:</span> {order.weight} kg</p>}
      {order.parcelCount && <p><span className="font-semibold">Parcels:</span> {order.parcelCount}</p>}
    </div>
  )
}

function ProofModal({
  order,
  kind,
  onClose,
  onDone,
}: {
  order: Order
  kind: 'delivered' | 'failed'
  onClose: () => void
  onDone: () => void
}) {
  const [receiverName, setReceiverName] = useState('')
  const [failureReason, setFailureReason] = useState('recipient_not_home')
  const [failureNote, setFailureNote] = useState('')
  const [codAmount, setCodAmount] = useState(order.paymentMethod === 'cod' ? String(order.cost ?? '') : '')
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [saving, setSaving] = useState(false)
  const sigRef = useRef<SignatureCanvas>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit() {
    setSaving(true)
    try {
      const gps = await getGps()
      let signatureS3Key: string | undefined
      let photoS3Key: string | undefined

      if (kind === 'delivered' && sigRef.current && !sigRef.current.isEmpty()) {
        try {
          const dataUrl = sigRef.current.toDataURL('image/png')
          const blob = await (await fetch(dataUrl)).blob()
          if (navigator.onLine) signatureS3Key = await uploadProof(order.id, 'signature', blob)
        } catch { /* upload failed — proceed without */ }
      }
      if (photoBlob && navigator.onLine) {
        try { photoS3Key = await uploadProof(order.id, 'photo', photoBlob) } catch { /* proceed */ }
      }

      if (kind === 'delivered') {
        const payload = {
          status: 'awaiting_confirmation' as const,
          proof: {
            receiverName: receiverName || undefined,
            signatureS3Key,
            photoS3Key,
            gps: gps || undefined,
          },
          codCollected: codAmount ? Number(codAmount) : undefined,
        }
        if (navigator.onLine) {
          await api.put(`/api/orders/${order.id}/status`, payload)
        } else {
          await enqueue({ type: 'status', orderId: order.id, payload })
        }
      } else {
        const payload = {
          status: 'failed' as const,
          failureReason,
          failureNote: failureNote || undefined,
        }
        if (navigator.onLine) {
          await api.put(`/api/orders/${order.id}/status`, payload)
        } else {
          await enqueue({ type: 'status', orderId: order.id, payload })
        }
      }
      toast.success(kind === 'delivered' ? 'Delivered!' : 'Marked as failed')
      onDone()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'delivered' ? 'Confirm delivery' : 'Delivery failed'}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={kind === 'delivered' ? 'success' : 'danger'}
            loading={saving}
            onClick={handleSubmit}
          >
            {kind === 'delivered' ? 'Confirm delivered' : 'Submit failure'}
          </Button>
        </div>
      }
    >
      {kind === 'delivered' ? (
        <div className="space-y-4">
          <Field label="Receiver name">
            <Input value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="Who received it?" />
          </Field>
          {order.paymentMethod === 'cod' && (
            <Field label="Cash collected" hint={`Fee is ${order.cost?.toLocaleString() ?? 0}`}>
              <Input type="number" value={codAmount} onChange={e => setCodAmount(e.target.value)} />
            </Field>
          )}
          <Field label="Signature">
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <SignatureCanvas
                ref={sigRef}
                canvasProps={{ width: 460, height: 160, className: 'w-full h-40' }}
              />
            </div>
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => sigRef.current?.clear()}
                className="text-xs text-slate-500 flex items-center gap-1"
              >
                <PenLine size={12} /> Clear
              </button>
            </div>
          </Field>
          <Field label="Photo (optional)">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => e.target.files?.[0] && setPhotoBlob(e.target.files[0])}
            />
            <Button
              type="button"
              variant="secondary"
              fullWidth
              icon={<Camera size={16} />}
              onClick={() => photoInputRef.current?.click()}
            >
              {photoBlob ? '✓ Photo captured — tap to retake' : 'Capture photo'}
            </Button>
          </Field>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <MapPin size={12} /> GPS coordinates captured automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={14} />
            The manager will see this and can reassign the order.
          </div>
          <Field label="Reason">
            <select className="input" value={failureReason} onChange={e => setFailureReason(e.target.value)}>
              <option value="recipient_not_home">Recipient not home</option>
              <option value="wrong_address">Wrong address</option>
              <option value="refused">Refused delivery</option>
              <option value="damaged">Damaged</option>
              <option value="unreachable">Unreachable / no phone</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Notes (optional)">
            <textarea className="input" rows={3} value={failureNote} onChange={e => setFailureNote(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  )
}

async function getGps(): Promise<{ lat: number; lng: number; accuracy: number; capturedAt: string } | null> {
  if (!navigator.geolocation) return null
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy,
        capturedAt: new Date().toISOString(),
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    )
  })
}

// Icon exported unused to avoid tree-shake warning during dev
export { CheckCircle2 }
