import { useEffect, useState } from 'react'
import type { Rider } from '@pullup/shared'
import { api, apiErrorMessage } from '../services/api'
import { Button, Card, Field, Input, Modal, Select, toast } from '../components/ui'
import { UserPlus, CheckCircle2, XCircle, RefreshCw, Package, Bike, ChevronDown, ChevronUp } from 'lucide-react'

interface RiderWithCounts extends Rider {
  email?: string
  orderCounts: { active: number; delivered: number; total: number }
}

interface OrderItem {
  id: string
  status: string
  customerName: string
  destination: string
  cost?: number
}

const emptyForm = { name: '', phone: '', email: '', zone: '', status: 'active' as const, ratePerDelivery: '', ratePctOfFee: '' }

export default function RidersPage() {
  const [riders, setRiders] = useState<RiderWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RiderWithCounts | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [riderOrders, setRiderOrders] = useState<Record<string, OrderItem[]>>({})
  const [loadingOrders, setLoadingOrders] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ items: RiderWithCounts[] }>('/api/riders')
      setRiders(res.data.items)
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openCreate() { setEditing(null); setForm({ ...emptyForm }); setModalOpen(true) }
  function openEdit(r: RiderWithCounts) {
    setEditing(r)
    setForm({ name: r.name, phone: r.phone, email: r.email ?? '', zone: r.zone, status: r.status as 'active'|'inactive', ratePerDelivery: r.ratePerDelivery ? String(r.ratePerDelivery) : '', ratePctOfFee: r.ratePctOfFee ? String(r.ratePctOfFee) : '' })
    setModalOpen(true)
  }

  async function save() {
    if (!form.name || !form.phone || !form.zone) return toast.warning('Name, phone and zone required')
    if (!editing && !form.email) return toast.warning('Email required for rider access')
    setSaving(true)
    try {
      const payload = { name: form.name, phone: form.phone, email: form.email || undefined, zone: form.zone, status: form.status, ratePerDelivery: form.ratePerDelivery ? Number(form.ratePerDelivery) : undefined, ratePctOfFee: form.ratePctOfFee ? Number(form.ratePctOfFee) : undefined }
      if (editing) {
        await api.put(`/api/riders/${editing.id}`, payload)
        toast.success('Rider updated')
      } else {
        const res = await api.post<{ rider: Rider; message: string }>('/api/riders', payload)
        toast.success(res.data.message || 'Rider created')
      }
      setModalOpen(false); load()
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setSaving(false) }
  }

  async function deactivate(r: RiderWithCounts) {
    if (!confirm(`Deactivate ${r.name}? They will lose rider app access.`)) return
    try { const res = await api.post<{message:string}>(`/api/riders/${r.id}/deactivate`); toast.success(res.data.message); load() }
    catch (err) { toast.error(apiErrorMessage(err)) }
  }

  async function activate(r: RiderWithCounts) {
    try { const res = await api.post<{message:string}>(`/api/riders/${r.id}/activate`); toast.success(res.data.message); load() }
    catch (err) { toast.error(apiErrorMessage(err)) }
  }

  async function toggleOrders(riderId: string) {
    if (expandedId === riderId) { setExpandedId(null); return }
    setExpandedId(riderId)
    if (riderOrders[riderId]) return
    setLoadingOrders(riderId)
    try {
      const res = await api.get<{ items: OrderItem[] }>(`/api/riders/${riderId}/orders`)
      setRiderOrders(prev => ({ ...prev, [riderId]: res.data.items }))
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setLoadingOrders(null) }
  }

  const statusCls: Record<string,'active'|'inactive'> = {}
  const statusColors: Record<string, string> = { active: 'bg-emerald-100 text-emerald-800', inactive: 'bg-slate-100 text-slate-600', on_delivery: 'bg-blue-100 text-blue-800' }
  const orderStatusColors: Record<string, string> = { assigned:'text-blue-700', picked_up:'text-sky-700', in_transit:'text-amber-700', awaiting_confirmation:'text-orange-700', confirmed:'text-emerald-700', delivered:'text-emerald-700', failed:'text-red-700', rejected:'text-red-700' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Riders</h1>
          <p className="text-sm text-slate-500 mt-1">Each rider sees only their own orders in the rider app</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={load} />
          <Button icon={<UserPlus size={14} />} onClick={openCreate}>Add Rider</Button>
        </div>
      </div>

      <div className="space-y-3">
        {loading && <Card><p className="text-slate-400 text-sm text-center py-8">Loading…</p></Card>}
        {!loading && riders.length === 0 && (
          <Card>
            <div className="text-center py-12">
              <Bike size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-700">No riders yet</p>
              <p className="text-sm text-slate-500 mt-1">Click "Add Rider" — they get access instantly.</p>
            </div>
          </Card>
        )}
        {riders.map(r => {
          const isExpanded = expandedId === r.id
          const orders = riderOrders[r.id] ?? []
          const isLoadingOrders = loadingOrders === r.id
          const isInactive = r.status === 'inactive'
          return (
            <Card key={r.id} className={isInactive ? 'opacity-60' : ''}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isInactive ? 'bg-slate-400' : 'bg-brand-600'}`}>
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{r.name}</p>
                    <p className="text-sm text-slate-500">{r.phone}</p>
                    {r.email && <p className="text-xs text-slate-400">{r.email}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[r.status] || statusColors.inactive}`}>{r.status.replace('_',' ')}</span>
                  <span className="text-slate-500">Zone: <strong className="text-slate-700">{r.zone}</strong></span>
                  <button onClick={() => toggleOrders(r.id)} className="flex items-center gap-1.5 text-slate-500 hover:text-brand-600 transition-colors">
                    <Package size={13} />
                    <span><strong className="text-slate-800">{r.orderCounts?.active ?? 0}</strong> active</span>
                    <span className="text-slate-300">·</span>
                    <span><strong className="text-slate-800">{r.orderCounts?.delivered ?? 0}</strong> done</span>
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {r.ratePerDelivery && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">GHS {r.ratePerDelivery}/delivery</span>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>Edit</Button>
                  {isInactive
                    ? <Button size="sm" variant="success" icon={<CheckCircle2 size={12} />} onClick={() => activate(r)}>Reactivate</Button>
                    : <Button size="sm" variant="danger" icon={<XCircle size={12} />} onClick={() => deactivate(r)}>Deactivate</Button>
                  }
                </div>
              </div>
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  {isLoadingOrders && <p className="text-sm text-slate-400 text-center py-3">Loading…</p>}
                  {!isLoadingOrders && orders.length === 0 && <p className="text-sm text-slate-400 text-center py-3">No orders assigned</p>}
                  {!isLoadingOrders && orders.length > 0 && (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-100">
                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 text-left">Customer</th>
                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 text-left">Destination</th>
                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 text-left">Status</th>
                        <th className="pb-2 text-xs font-semibold text-slate-500 text-left">Cost</th>
                      </tr></thead>
                      <tbody>
                        {orders.slice(0,10).map(o => (
                          <tr key={o.id} className="border-b border-slate-50 last:border-0">
                            <td className="py-2 pr-4 font-medium">{o.customerName}</td>
                            <td className="py-2 pr-4 text-slate-600 max-w-xs truncate">{o.destination}</td>
                            <td className="py-2 pr-4"><span className={`font-medium text-xs ${orderStatusColors[o.status] || 'text-slate-600'}`}>{o.status.replace(/_/g,' ')}</span></td>
                            <td className="py-2 text-slate-700">{o.cost ? o.cost.toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {orders.length > 10 && <p className="text-xs text-slate-400 mt-2 text-right">Showing 10 of {orders.length}</p>}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit — ${editing.name}` : 'Add Rider'} size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button loading={saving} onClick={save}>{editing ? 'Save changes' : 'Create & provision'}</Button></div>}>
        <div className="space-y-4">
          {!editing && (
            <div className="bg-brand-50 border border-brand-100 rounded-lg px-4 py-3 text-sm text-brand-800">
              <strong>One-click provisioning:</strong> Adding an email automatically gives this rider access to{' '}
              <strong>pulluprider.aegisassetllc.com</strong> via email OTP. They will only see their own orders.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" required><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Kwame Mensah" /></Field>
            <Field label="Phone" required><Input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="+233201234567" /></Field>
          </div>
          <Field label={editing ? 'Email (read-only after creation)' : 'Email address'} required={!editing}>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="driver@example.com" disabled={!!editing} />
            {!editing && <p className="text-xs text-slate-400 mt-1">Used for sign-in — cannot be changed after creation</p>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Zone" required><Input value={form.zone} onChange={e => setForm(f => ({...f, zone: e.target.value}))} placeholder="Accra Central" /></Field>
            <Field label="Status">
              <Select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value as 'active'|'inactive'}))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate per delivery (GHS)" hint="Fixed fee per delivery"><Input type="number" min="0" value={form.ratePerDelivery} onChange={e => setForm(f => ({...f, ratePerDelivery: e.target.value}))} placeholder="25" /></Field>
            <Field label="% of delivery fee" hint="e.g. 10 = 10% of order cost"><Input type="number" min="0" max="100" value={form.ratePctOfFee} onChange={e => setForm(f => ({...f, ratePctOfFee: e.target.value}))} placeholder="10" /></Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
