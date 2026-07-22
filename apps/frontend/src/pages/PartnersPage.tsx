import { useEffect, useState } from 'react'
import type { Partner } from '@pullup/shared'
import { api, apiErrorMessage } from '../services/api'
import { Badge, Button, Card, Field, Input, Modal, Table, toast } from '../components/ui'
import { Building2, Download, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'

const emptyForm = { name: '', getUrl: '', putUrlTemplate: '', apiKey: '', webhookSecret: '', branchId: 'default', active: true }

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partner | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ items: Partner[] }>('/api/partners')
      setPartners(res.data.items)
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  function openEdit(p: Partner) {
    setEditing(p)
    setForm({
      name: p.name,
      getUrl: p.getUrl ?? '',
      putUrlTemplate: p.putUrlTemplate ?? '',
      apiKey: p.apiKey ?? '',
      webhookSecret: p.webhookSecret ?? '',
      branchId: p.branchId ?? 'default',
      active: p.active,
    })
    setModalOpen(true)
  }

  async function save() {
    if (!form.name.trim()) return toast.warning('Partner name is required')
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        email: (form as any).email?.trim() || undefined,
        getUrl: form.getUrl.trim() || undefined,
        putUrlTemplate: form.putUrlTemplate.trim() || undefined,
        apiKey: form.apiKey.trim() || undefined,
        webhookSecret: form.webhookSecret.trim() || undefined,
        branchId: form.branchId.trim() || 'default',
        active: form.active,
      }
      if (editing) {
        await api.put(`/api/partners/${editing.id}`, body)
        toast.success('Partner updated')
      } else {
        await api.post('/api/partners', body)
        toast.success('Partner created')
      }
      setModalOpen(false)
      load()
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setSaving(false) }
  }

  async function remove(p: Partner) {
    if (!confirm(`Delete partner "${p.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/api/partners/${p.id}`)
      toast.success('Partner deleted')
      load()
    } catch (err) { toast.error(apiErrorMessage(err)) }
  }

  async function fetchNow(id: string) {
    setFetchingId(id)
    try {
      const r = await api.post<{ imported: number; skipped: number }>(`/api/partners/${id}/fetch`)
      toast.success(`Imported ${r.data.imported} (skipped ${r.data.skipped})`)
      load()
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setFetchingId(null) }
  }

  async function toggle(p: Partner) {
    try {
      await api.put(`/api/partners/${p.id}`, { active: !p.active })
      load()
    } catch (err) { toast.error(apiErrorMessage(err)) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Partners</h1>
          <p className="text-sm text-slate-500 mt-1">API integrations that push orders into PullUp</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
          <Button icon={<Plus size={14} />} onClick={openAdd}>Add Partner</Button>
        </div>
      </div>

      <Card padded={false}>
        <div className="p-4 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 rounded-t-lg">
          💡 Partners are external systems (e-commerce stores, apps) that send orders to PullUp via API. Set a GET URL to pull orders automatically every 5 minutes.
        </div>
        <Table
          loading={loading}
          rows={partners}
          rowKey={p => p.id}
          emptyMessage="No partners yet. Click 'Add Partner' to connect an order source."
          columns={[
            { key: 'name', header: 'Name', render: p => <span className="font-semibold">{p.name}</span> },
            {
              key: 'url', header: 'GET URL',
              render: p => (
                <span className="text-xs text-slate-500 font-mono max-w-[200px] truncate block" title={p.getUrl ?? ''}>
                  {p.getUrl ?? <span className="text-slate-300">not set</span>}
                </span>
              ),
            },
            {
              key: 'active', header: 'Status',
              render: p => (
                <button onClick={() => toggle(p)}>
                  <Badge variant={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                </button>
              ),
            },
            {
              key: 'last', header: 'Last fetched',
              render: p => (
                <span className="text-xs text-slate-500">
                  {p.lastFetchedAt ? new Date(p.lastFetchedAt).toLocaleString() : 'Never'}
                </span>
              ),
            },
            {
              key: 'actions', header: '',
              render: p => (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" loading={fetchingId === p.id}
                    icon={<Download size={12} />} onClick={() => fetchNow(p.id)}>
                    Fetch
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => openEdit(p)} />
                  <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => remove(p)} />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? `Edit — ${editing.name}` : 'Add Partner'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} icon={<Building2 size={14} />}>
              {editing ? 'Save changes' : 'Create partner'}
            </Button>
          </div>
        }>
        <div className="space-y-4">
          <Field label="Partner name" required hint="e.g. Jumia, Tonaton, your website">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Online Store" autoFocus />
          </Field>
          <Field label="Email address" hint="Required for partner portal login (pulluppartner.aegisassetllc.com)">
            <Input type="email" value={(form as any).email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value } as any))} placeholder="partner@business.com" />
          </Field>
          <Field label="GET URL" hint="PullUp polls this URL every 5 min to pull new orders">
            <Input value={form.getUrl} onChange={e => setForm(f => ({ ...f, getUrl: e.target.value }))}
              placeholder="https://your-store.com/api/orders/pending" type="url" />
          </Field>
          <Field label="PUT URL template" hint="Called to update order status back to your system. Use {orderId}">
            <Input value={form.putUrlTemplate} onChange={e => setForm(f => ({ ...f, putUrlTemplate: e.target.value }))}
              placeholder="https://your-store.com/api/orders/{orderId}/status" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="API key" hint="Sent as Authorization: Bearer {key}">
              <Input value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-..." type="password" />
            </Field>
            <Field label="Webhook secret" hint="For verifying inbound webhooks">
              <Input value={form.webhookSecret} onChange={e => setForm(f => ({ ...f, webhookSecret: e.target.value }))}
                placeholder="whsec-..." type="password" />
            </Field>
          </div>
          <Field label="Branch ID" hint="Which branch handles this partner's orders">
            <Input value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))} placeholder="default" />
          </Field>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="active" checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="h-4 w-4 rounded" />
            <label htmlFor="active" className="text-sm font-medium text-slate-700">Active (polls automatically)</label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
