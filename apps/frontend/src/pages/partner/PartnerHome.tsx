import { useEffect, useState } from 'react'
import type { Order } from '@pullup/shared'
import { api, apiErrorMessage, logout } from '../../services/api'
import { Badge, Button, Card, StatusBadge, toast } from '../../components/ui'
import { Building2, Download, FileSpreadsheet, LogOut, Package, RefreshCw, Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function PartnerHome() {
  const { user, logout: authLogout } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [tab, setTab] = useState<'orders' | 'place'>('orders')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ items: Order[] }>('/api/orders?limit=50')
      setOrders(res.data.items)
    } catch (err) {
      if (navigator.onLine) toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Stats
  const pending = orders.filter(o => o.status === 'pending' || o.status === 'assigned').length
  const inTransit = orders.filter(o => ['picked_up', 'in_transit'].includes(o.status)).length
  const delivered = orders.filter(o => ['delivered', 'confirmed'].includes(o.status)).length

  async function uploadCsv(file: File) {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post<{ imported: number; skipped: number; locationRequested?: number; errors: string[] }>(
        '/api/orders/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      if (res.data.imported > 0) toast.success(`✅ Imported ${res.data.imported} orders`)
      if (res.data.locationRequested) toast.info(`📍 ${res.data.locationRequested} recipients sent location request`)
      if (res.data.skipped > 0) toast.warning(`⚠️ ${res.data.skipped} rows skipped`)
      if (res.data.errors?.length) res.data.errors.slice(0, 3).forEach(e => toast.error(e))
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-purple-600 flex items-center justify-center">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">{user?.name}</p>
            <p className="text-xs text-slate-400">Partner Portal</p>
          </div>
        </div>
        <button onClick={authLogout} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
          <LogOut size={14} />
          Sign out
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending', value: pending, color: 'bg-amber-50 text-amber-700' },
            { label: 'In Transit', value: inTransit, color: 'bg-blue-50 text-blue-700' },
            { label: 'Delivered', value: delivered, color: 'bg-emerald-50 text-emerald-700' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['orders', 'place'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t === 'orders' ? '📦 My Orders' : '➕ Place Order'}
            </button>
          ))}
        </div>

        {tab === 'orders' && (
          <>
            {/* Bulk import */}
            <Card>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-semibold text-sm">Bulk import</p>
                  <p className="text-xs text-slate-400">Upload multiple orders at once via CSV/Excel</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href="/PullUp_Bulk_Order_Template.xlsx"
                    download="PullUp_Bulk_Order_Template.xlsx"
                    className="inline-flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-2 rounded-lg"
                  >
                    <FileSpreadsheet size={13} /> Template
                  </a>
                  <label className="inline-flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold px-3 py-2 rounded-lg cursor-pointer">
                    <Upload size={13} />
                    {importing ? 'Importing…' : 'Upload CSV'}
                    <input type="file" accept=".csv,.xlsx" className="hidden" onChange={e => e.target.files?.[0] && uploadCsv(e.target.files[0])} disabled={importing} />
                  </label>
                </div>
              </div>
            </Card>

            {/* Orders list */}
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Orders ({orders.length})</h2>
              <Button variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />} onClick={load}>
                Refresh
              </Button>
            </div>

            {orders.length === 0 && !loading && (
              <Card>
                <div className="text-center py-10">
                  <Package className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-500">No orders yet. Place one or upload a CSV.</p>
                </div>
              </Card>
            )}

            <div className="space-y-3">
              {orders.map(o => (
                <Card key={o.id} padded={false}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-semibold text-slate-900">{o.customerName}</p>
                        <p className="text-xs text-slate-400 font-mono">{o.id.slice(-12)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={o.status} />
                        {o.description?.includes('[AWAITING_LOCATION]') && (
                          <Badge variant="amber">📍 Awaiting location</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">📍 {o.destination}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-purple-700">
                        {o.cost ? `GHS ${o.cost.toFixed(2)}` : '—'}
                      </span>
                      <a
                        href={`https://pullupcustomer.aegisassetllc.com/track?orderId=${o.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-purple-600 hover:underline font-semibold"
                      >
                        Track →
                      </a>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {tab === 'place' && <PartnerOrderForm onOrderPlaced={load} />}
      </div>
    </div>
  )
}

function PartnerOrderForm({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const [form, setForm] = useState({
    senderName: '', senderPhone: '', senderAddress: '',
    recipientName: '', recipientPhone: '', recipientAddress: '',
    description: '', weight: '', paymentMethod: 'cod' as 'cod' | 'prepaid', specialInstructions: '',
  })
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/api/public/orders', {
        ...form,
        weight: form.weight ? Number(form.weight) : undefined,
      })
      toast.success('Order placed! ✅ Admin will assign a rider.')
      setForm({ senderName: '', senderPhone: '', senderAddress: '', recipientName: '', recipientPhone: '', recipientAddress: '', description: '', weight: '', paymentMethod: 'cod', specialInstructions: '' })
      onOrderPlaced()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const u = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <Card title="Place a delivery order">
      <form onSubmit={submit} className="space-y-3">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Sender (you)</p>
          <div className="space-y-2">
            <input className="input w-full" placeholder="Sender name *" required value={form.senderName} onChange={u('senderName')} />
            <input className="input w-full" placeholder="Sender phone *" required value={form.senderPhone} onChange={u('senderPhone')} />
            <input className="input w-full" placeholder="Pickup address *" required value={form.senderAddress} onChange={u('senderAddress')} />
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Recipient</p>
          <div className="space-y-2">
            <input className="input w-full" placeholder="Recipient name *" required value={form.recipientName} onChange={u('recipientName')} />
            <input className="input w-full" placeholder="Recipient phone *" required value={form.recipientPhone} onChange={u('recipientPhone')} />
            <input className="input w-full" placeholder="Delivery address" value={form.recipientAddress} onChange={u('recipientAddress')} />
            <input className="input w-full" placeholder="What are you sending? *" required value={form.description} onChange={u('description')} />
            <input className="input w-full" placeholder="Weight in kg (optional)" type="number" min="0" step="0.1" value={form.weight} onChange={u('weight')} />
            <select className="input w-full" value={form.paymentMethod} onChange={u('paymentMethod')}>
              <option value="cod">Cash on Delivery</option>
              <option value="prepaid">Prepaid</option>
            </select>
          </div>
        </div>
        <Button type="submit" fullWidth loading={loading}>Submit order</Button>
      </form>
    </Card>
  )
}
