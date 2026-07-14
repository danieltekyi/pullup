import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Badge, Table } from '../components/ui'

interface Branch {
  id: string
  name: string
  city: string
  country: string
  currency: string
  timezone: string
  active: boolean
}

export default function BranchesPage() {
  const [items, setItems] = useState<Branch[]>([])
  useEffect(() => {
    api.get<{ items: Branch[] }>('/api/branches').then(r => setItems(r.data.items)).catch(() => undefined)
  }, [])
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Branches</h1>
        <p className="text-sm text-slate-500 mt-1">Operational locations</p>
      </div>
      <Table
        rows={items}
        rowKey={b => b.id}
        columns={[
          { key: 'name', header: 'Name', render: b => <span className="font-semibold">{b.name}</span> },
          { key: 'city', header: 'City', render: b => `${b.city}, ${b.country}` },
          { key: 'currency', header: 'Currency', render: b => b.currency },
          { key: 'timezone', header: 'Timezone', render: b => b.timezone },
          { key: 'active', header: 'Active', render: b => <Badge variant={b.active ? 'green' : 'gray'}>{b.active ? 'Active' : 'Inactive'}</Badge> },
        ]}
      />
    </div>
  )
}
