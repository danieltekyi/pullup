import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '../services/api'
import { Badge, Button, Card, Field, Input, Modal, Select, Table, toast } from '../components/ui'
import { UserPlus, Pencil, RefreshCw } from 'lucide-react'

interface AppUser {
  id: string
  name: string
  email: string
  role: string
  status: string
  branchId?: string
}

const emptyForm = { name: '', email: '', role: 'rider', status: 'active', branchId: '' }

export default function UsersPage() {
  const [items, setItems] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<{ items: AppUser[] }>('/api/users')
      setItems(r.data.items)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyForm })
    setModalOpen(true)
  }

  function openEdit(u: AppUser) {
    setEditing(u)
    setForm({ name: u.name, email: u.email, role: u.role, status: u.status, branchId: u.branchId ?? '' })
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/api/users/${editing.id}`, {
          name: form.name,
          role: form.role,
          status: form.status,
          branchId: form.branchId || null,
        })
        toast.success('User updated')
      } else {
        toast.info('New users sign in via Cloudflare Access — their profile is created automatically on first login. Use this form to update existing users.')
        setModalOpen(false)
        setSaving(false)
        return
      }
      setModalOpen(false)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setSaving(false) }
  }

  async function toggleStatus(u: AppUser) {
    try {
      await api.put(`/api/users/${u.id}`, { status: u.status === 'active' ? 'inactive' : 'active' })
      toast.success(`${u.name} ${u.status === 'active' ? 'deactivated' : 'activated'}`)
      load()
    } catch (err) { toast.error(apiErrorMessage(err)) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-slate-500 mt-1">People who can sign in to PullUp</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
          <Button icon={<UserPlus size={14} />} onClick={openAdd}>Invite user</Button>
        </div>
      </div>

      <Card padded={false}>
        <div className="p-4 bg-blue-50 border-b border-blue-100 text-sm text-blue-700 rounded-t-lg">
          💡 Users are created automatically when someone signs in via Cloudflare Access. Use the edit button to change their role or deactivate them.
        </div>
        <Table
          loading={loading}
          rows={items}
          rowKey={u => u.id}
          emptyMessage="No users yet — they appear here after first sign-in"
          columns={[
            { key: 'name', header: 'Name', render: u => <span className="font-semibold">{u.name}</span> },
            { key: 'email', header: 'Email', render: u => <span className="text-sm">{u.email}</span> },
            { key: 'role', header: 'Role', render: u => <Badge variant={u.role === 'super-admin' ? 'red' : u.role === 'manager' ? 'blue' : 'green'}>{u.role}</Badge> },
            { key: 'status', header: 'Status', render: u => <Badge variant={u.status === 'active' ? 'green' : 'gray'}>{u.status}</Badge> },
            { key: 'branch', header: 'Branch', render: u => <span className="text-sm text-slate-500">{u.branchId ?? '—'}</span> },
            {
              key: 'actions', header: '',
              render: u => (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" icon={<Pencil size={12} />} onClick={() => openEdit(u)}>Edit</Button>
                  <Button size="sm" variant={u.status === 'active' ? 'danger' : 'success'}
                    onClick={() => toggleStatus(u)}>
                    {u.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? `Edit — ${editing.name}` : 'Invite user'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </div>
        }>
        <div className="space-y-4">
          {!editing && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Users join automatically when they first sign in via Cloudflare Access with their email. 
              To invite someone, share the link: <strong>pullup.aegisassetllc.com</strong> — their account is created on first login.
            </p>
          )}
          <Field label="Full name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" />
          </Field>
          {editing && (
            <Field label="Email"><Input value={form.email} disabled /></Field>
          )}
          <Field label="Role" required>
            <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="rider">Rider</option>
              <option value="manager">Manager</option>
              <option value="super-admin">Super Admin</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Branch ID" hint="Optional — e.g. 'default'">
            <Input value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))} placeholder="default" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
