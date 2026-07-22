import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Filter, Download, Upload, RefreshCw, X, UserCheck } from 'lucide-react'
import type { Order, OrderStatus } from '@pullup/shared'
import { api, apiErrorMessage } from '../services/api'
import { Badge, Button, Card, Field, Input, Modal, Select, StatusBadge, Table, toast } from '../components/ui'

interface RiderItem { id: string; name: string; zone: string }

const STATUS_OPTIONS: OrderStatus[] = [
  'pending', 'assigned', 'picked_up', 'in_transit', 'delivered',
  'awaiting_confirmation', 'confirmed', 'rejected', 'failed', 'cancelled',
]

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState<string | undefined>()
  const [nextCursor, setNextCursor] = useState<string | undefined>()

  // Rider assign state
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [assignModal, setAssignModal] = useState<{ orderIds: string[]; label: string; currentCost?: number } | null>(null)
  const [assignRiderId, setAssignRiderId] = useState('')
  const [assignCost, setAssignCost] = useState('')
  const [assigning, setAssigning] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (statusFilter) params.set('status', statusFilter)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (cursor) params.set('cursor', cursor)
      const [res, ridersRes] = await Promise.all([
        api.get<{ items: Order[]; cursor?: string }>(`/api/orders?${params}`),
        riders.length ? Promise.resolve(null) : api.get<{ items: RiderItem[] }>('/api/riders?status=active&limit=100'),
      ])
      setOrders(res.data.items)
      setNextCursor(res.data.cursor)
      if (ridersRes) setRiders(ridersRes.data.items)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [statusFilter, from, to, cursor])

  const selectedIds = useMemo(() => [...selected], [selected])

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function openAssign(orderIds: string[], label: string, currentCost?: number) {
    setAssignRiderId('')
    setAssignCost(currentCost ? String(currentCost) : '')
    setAssignModal({ orderIds, label, currentCost })
  }

  async function submitAssign() {
    if (!assignRiderId || !assignModal) return
    setAssigning(true)
    try {
      const cost = assignCost ? parseFloat(assignCost) : undefined
      if (assignModal.orderIds.length === 1) {
        await api.post(`/api/orders/${assignModal.orderIds[0]}/assign`, { riderId: assignRiderId, ...(cost ? { cost } : {}) })
      } else {
        await api.post('/api/orders/bulk-assign', { orderIds: assignModal.orderIds, riderId: assignRiderId, ...(cost ? { cost } : {}) })
      }
      toast.success(`Rider assigned to ${assignModal.orderIds.length} order(s)`)
      setSelected(new Set())
      setAssignModal(null)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setAssigning(false)
    }
  }

  function exportCsv() {
    window.open(`${import.meta.env.VITE_API_URL || ''}/api/orders/export.csv`, '_blank')
  }

  async function uploadCsv(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post<{ imported: number }>('/api/orders/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success(`Imported ${res.data.imported} orders`)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and dispatch deliveries</p>
        </div>
        <div className="flex gap-2">
          <label className="btn btn-secondary btn-md cursor-pointer">
            <Upload size={14} />
            Import CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && uploadCsv(e.target.files[0])}
            />
          </label>
          <Button variant="secondary" icon={<Download size={14} />} onClick={exportCsv}>
            Export
          </Button>
        </div>
      </div>

      <Card>
        <form
          onSubmit={e => {
            e.preventDefault()
            setCursor(undefined)
            load()
          }}
          className="grid grid-cols-1 md:grid-cols-5 gap-3"
        >
          <Field label="Search">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Customer, ID, phone…" className="pl-9" />
            </div>
          </Field>
          <Field label="Status">
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" icon={<Filter size={14} />}>Apply</Button>
            <Button type="button" variant="ghost" icon={<X size={14} />}
              onClick={() => { setQ(''); setStatusFilter(''); setFrom(''); setTo(''); setCursor(undefined) }}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-brand-50 border border-brand-100 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-brand-700">{selectedIds.length} selected</span>
          <div className="flex gap-2">
            <Button size="sm" icon={<UserCheck size={14} />}
              onClick={() => openAssign(selectedIds, `${selectedIds.length} selected orders`)}>
              Assign rider
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <Table
        loading={loading}
        rows={orders}
        rowKey={o => o.id}
        emptyMessage="No orders match those filters"
        columns={[
          {
            key: 'sel', width: 40,
            header: (
              <input type="checkbox"
                checked={orders.length > 0 && orders.every(o => selected.has(o.id))}
                onChange={e => setSelected(e.target.checked ? new Set(orders.map(o => o.id)) : new Set())}
              />
            ),
            render: o => <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />,
          },
          {
            key: 'id', header: 'ID',
            render: o => (
              <Link to={`/orders/${o.id}`} className="font-mono text-xs text-brand-600 hover:underline">
                {o.id.slice(0, 20)}
              </Link>
            ),
          },
          {
            key: 'customer', header: 'Customer',
            render: o => (
              <div>
                <p className="font-medium">{o.customerName}</p>
                {o.customerPhone && <p className="text-xs text-slate-500">{o.customerPhone}</p>}
              </div>
            ),
          },
          {
            key: 'status', header: 'Status',
            render: o => (
              <div className="flex flex-col gap-1">
                <StatusBadge status={o.status} />
                {o.partnerId && !o.cost && <Badge variant="amber">Needs pricing</Badge>}
                {o.priority === 'urgent' && <Badge variant="red">Urgent</Badge>}
                {o.description?.includes('[AWAITING_LOCATION]') && <Badge variant="amber">📍 Awaiting location</Badge>}
              </div>
            ),
          },
          {
            key: 'zone', header: 'Destination',
            render: o => (
              <div className="text-sm">
                <p>{o.destination}</p>
                {o.destinationZone && <p className="text-xs text-slate-500">Zone {o.destinationZone}</p>}
              </div>
            ),
          },
          {
            key: 'assigned', header: 'Rider',
            render: o => (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">
                  {riders.find(r => r.id === o.assignedTo)?.name || o.assignedTo?.slice(0, 12) || '—'}
                </span>
                {(o.status === 'pending' || o.status === 'assigned') && (
                  <button
                    onClick={() => openAssign([o.id], o.customerName, o.cost ?? undefined)}
                    className="text-xs text-brand-600 hover:text-brand-800 font-semibold whitespace-nowrap"
                  >
                    {o.assignedTo ? 'Reassign' : 'Assign →'}
                  </button>
                )}
              </div>
            ),
          },
          {
            key: 'cost', header: 'Cost',
            render: o => <span className="font-semibold">{o.cost ? o.cost.toLocaleString() : '—'}</span>,
          },
          {
            key: 'created', header: 'Created',
            render: o => <span className="text-xs text-slate-500">{new Date(o.createdAt).toLocaleString()}</span>,
          },
          {
            key: 'del', header: '',
            render: o => (
              <button
                onClick={async () => {
                  if (!confirm(`Delete order ${o.id.slice(-8)}?`)) return
                  try { await api.delete(`/api/orders/${o.id}`); toast.success('Deleted'); load() }
                  catch (err) { toast.error(apiErrorMessage(err)) }
                }}
                className="text-xs text-red-400 hover:text-red-600 font-medium px-2"
              >✕</button>
            ),
          },
        ]}
      />

      <div className="flex items-center justify-between">
        <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={() => { setCursor(undefined); load() }}>
          Refresh
        </Button>
        {nextCursor && (
          <Button variant="ghost" onClick={() => setCursor(nextCursor)}>Load more</Button>
        )}
      </div>

      {/* Assign rider modal */}
      <Modal
        open={!!assignModal}
        onClose={() => setAssignModal(null)}
        title={`Assign rider — ${assignModal?.label}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAssignModal(null)}>Cancel</Button>
            <Button onClick={submitAssign} loading={assigning} disabled={!assignRiderId}
              icon={<UserCheck size={14} />}>
              Assign
            </Button>
          </div>
        }
      >
        <Field label="Select rider" required>
          <Select value={assignRiderId} onChange={e => setAssignRiderId(e.target.value)}>
            <option value="">— choose a rider —</option>
            {riders.map(r => (
              <option key={r.id} value={r.id}>{r.name} ({r.zone})</option>
            ))}
          </Select>
        </Field>
        <Field label="Delivery cost (GHS)" hint="Set or update the delivery fee for this order">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={assignCost}
            onChange={e => setAssignCost(e.target.value)}
            placeholder="e.g. 45.00"
          />
        </Field>
        {riders.length === 0 && (
          <p className="text-sm text-amber-600 mt-2">No active riders found. Add riders in the Riders page first.</p>
        )}
      </Modal>
    </div>
  )
}


