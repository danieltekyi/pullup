import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Badge, Table } from '../components/ui'

interface AppUser {
  id: string
  name: string
  email: string
  role: string
  status: string
  branchId?: string
}

export default function UsersPage() {
  const [items, setItems] = useState<AppUser[]>([])
  useEffect(() => {
    api.get<{ items: AppUser[] }>('/api/users').then(r => setItems(r.data.items)).catch(() => undefined)
  }, [])
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-slate-500 mt-1">People who can sign in to PullUp</p>
      </div>
      <Table
        rows={items}
        rowKey={u => u.id}
        columns={[
          { key: 'name', header: 'Name', render: u => <span className="font-semibold">{u.name}</span> },
          { key: 'email', header: 'Email', render: u => u.email },
          { key: 'role', header: 'Role', render: u => <Badge variant={u.role === 'super-admin' ? 'red' : u.role === 'manager' ? 'blue' : 'green'}>{u.role}</Badge> },
          { key: 'status', header: 'Status', render: u => <Badge variant={u.status === 'active' ? 'green' : 'gray'}>{u.status}</Badge> },
          { key: 'branch', header: 'Branch', render: u => u.branchId ?? '—' },
        ]}
      />
    </div>
  )
}
