import { useEffect, useState } from 'react'
import type { Rider } from '@pullup/shared'
import { api, apiErrorMessage } from '../services/api'
import { Badge, Button, Table, toast } from '../components/ui'
import { UserPlus } from 'lucide-react'

export default function RidersPage() {
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ items: Rider[] }>('/api/riders')
      setRiders(res.data.items)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Riders</h1>
          <p className="text-sm text-slate-500 mt-1">Your delivery team</p>
        </div>
        <Button icon={<UserPlus size={14} />}>Add Rider</Button>
      </div>
      <Table
        loading={loading}
        rows={riders}
        rowKey={r => r.id}
        columns={[
          { key: 'name', header: 'Name', render: r => <span className="font-semibold">{r.name}</span> },
          { key: 'phone', header: 'Phone', render: r => r.phone },
          { key: 'zone', header: 'Zone', render: r => r.zone },
          {
            key: 'status',
            header: 'Status',
            render: r => (
              <Badge variant={r.status === 'active' ? 'green' : r.status === 'on_delivery' ? 'blue' : 'gray'}>
                {r.status}
              </Badge>
            ),
          },
        ]}
      />
    </div>
  )
}
