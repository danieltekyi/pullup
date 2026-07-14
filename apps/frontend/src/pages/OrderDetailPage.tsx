import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Order, OrderEvent } from '@pullup/shared'
import { api, apiErrorMessage } from '../services/api'
import { Button, Card, StatusBadge, toast } from '../components/ui'
import { CheckCircle2, XCircle, Truck } from 'lucide-react'

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const [o, e] = await Promise.all([
        api.get<Order>(`/api/orders/${id}`),
        api.get<{ items: OrderEvent[] }>(`/api/orders/${id}/events`),
      ])
      setOrder(o.data)
      setEvents(e.data.items)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function confirm() {
    try {
      await api.put(`/api/orders/${id}/confirm`)
      toast.success('Order confirmed')
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  async function reject() {
    try {
      await api.put(`/api/orders/${id}/reject`)
      toast.success('Order rejected')
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (!order) return <div className="p-8 text-slate-400">Order not found</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 font-mono">{order.id}</p>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {order.customerName}
            <StatusBadge status={order.status} />
          </h1>
        </div>
        {order.status === 'awaiting_confirmation' && (
          <div className="flex gap-2">
            <Button variant="success" icon={<CheckCircle2 size={16} />} onClick={confirm}>
              Confirm delivery
            </Button>
            <Button variant="danger" icon={<XCircle size={16} />} onClick={reject}>
              Reject
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Order details" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Row label="Customer" value={order.customerName} />
            <Row label="Phone" value={order.customerPhone || '—'} />
            <Row label="Destination" value={order.destination} />
            <Row label="Zone" value={order.destinationZone || '—'} />
            <Row label="Weight" value={order.weight ? `${order.weight} kg` : '—'} />
            <Row label="Priority" value={order.priority} />
            <Row label="Payment" value={order.paymentMethod} />
            <Row label="Cost" value={order.cost ? String(order.cost) : '—'} />
            <Row label="Assigned to" value={order.assignedTo || '—'} />
            <Row label="Partner" value={order.partnerId || '—'} />
            <Row label="Created" value={new Date(order.createdAt).toLocaleString()} />
            <Row label="Updated" value={new Date(order.updatedAt).toLocaleString()} />
          </dl>
          {order.proof && (
            <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Truck size={14} /> Proof of delivery
              </h4>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Row label="Receiver" value={order.proof.receiverName || '—'} />
                <Row label="Captured" value={new Date(order.proof.timestamp).toLocaleString()} />
                {order.proof.gps && (
                  <Row label="GPS" value={`${order.proof.gps.lat.toFixed(5)}, ${order.proof.gps.lng.toFixed(5)}`} />
                )}
              </dl>
            </div>
          )}
        </Card>

        <Card title="Timeline">
          <ol className="relative border-l-2 border-slate-100 pl-4 space-y-4">
            {events.map(evt => (
              <li key={evt.id} className="relative">
                <span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-brand-600 ring-4 ring-white" />
                <p className="text-sm font-semibold capitalize">{evt.type.replace(/_/g, ' ')}</p>
                <p className="text-xs text-slate-500">
                  {new Date(evt.at).toLocaleString()} • {evt.actor.role}
                </p>
                {evt.note && <p className="text-xs text-slate-600 mt-1">{evt.note}</p>}
              </li>
            ))}
            {events.length === 0 && <p className="text-sm text-slate-400">No events yet</p>}
          </ol>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase font-semibold text-slate-500 tracking-wide">{label}</dt>
      <dd className="text-sm text-slate-900 mt-0.5">{value}</dd>
    </div>
  )
}
