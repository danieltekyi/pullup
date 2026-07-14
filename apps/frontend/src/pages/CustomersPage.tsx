import { useEffect, useState } from 'react'
import type { Customer } from '@pullup/shared'
import { api } from '../services/api'
import { Card, Table } from '../components/ui'

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([])
  useEffect(() => {
    api.get<{ items: Customer[] }>('/api/customers').then(r => setItems(r.data.items)).catch(() => undefined)
  }, [])
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-sm text-slate-500 mt-1">People you've delivered to</p>
      </div>
      <Card padded={false}>
        <Table
          rows={items}
          rowKey={c => c.id}
          emptyMessage="No customers yet — they'll appear here after their first delivery"
          columns={[
            { key: 'name', header: 'Name', render: c => <span className="font-semibold">{c.name}</span> },
            { key: 'phone', header: 'Phone', render: c => c.phone },
            { key: 'orders', header: 'Orders', render: c => c.totalOrders },
            { key: 'spent', header: 'Spent', render: c => c.totalSpent.toLocaleString() },
            {
              key: 'last',
              header: 'Last order',
              render: c => (c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—'),
            },
          ]}
        />
      </Card>
    </div>
  )
}
