import { useEffect, useState } from 'react'
import type { Vehicle } from '@pullup/shared'
import { api, apiErrorMessage } from '../services/api'
import { Badge, Button, Table, toast } from '../components/ui'
import { Truck } from 'lucide-react'

function expiryStatus(d?: string): 'ok' | 'soon' | 'expired' {
  if (!d) return 'ok'
  const diff = new Date(d).getTime() - Date.now()
  if (diff < 0) return 'expired'
  if (diff < 30 * 86_400_000) return 'soon'
  return 'ok'
}

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ items: Vehicle[] }>('/api/fleet')
      setVehicles(res.data.items)
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
          <h1 className="text-2xl font-bold">Fleet</h1>
          <p className="text-sm text-slate-500 mt-1">Vehicles, trackers, and expiries</p>
        </div>
        <Button icon={<Truck size={14} />}>Add Vehicle</Button>
      </div>
      <Table
        loading={loading}
        rows={vehicles}
        rowKey={v => v.id}
        columns={[
          {
            key: 'model',
            header: 'Vehicle',
            render: v => (
              <span className="font-semibold">
                {v.make} {v.model}
              </span>
            ),
          },
          { key: 'reg', header: 'Registration', render: v => <span className="font-mono">{v.registration}</span> },
          {
            key: 'status',
            header: 'Status',
            render: v => (
              <Badge variant={v.status === 'available' ? 'green' : v.status === 'in_use' ? 'blue' : 'amber'}>
                {v.status}
              </Badge>
            ),
          },
          {
            key: 'insurance',
            header: 'Insurance',
            render: v => (
              <ExpiryCell date={v.insuranceExpiry} />
            ),
          },
          {
            key: 'licence',
            header: 'Licence',
            render: v => <ExpiryCell date={v.licenseExpiry} />,
          },
        ]}
      />
    </div>
  )
}

function ExpiryCell({ date }: { date?: string }) {
  const s = expiryStatus(date)
  if (!date) return <span className="text-slate-400">—</span>
  if (s === 'expired') return <Badge variant="red">Expired — {date}</Badge>
  if (s === 'soon') return <Badge variant="amber">Expires {date}</Badge>
  return <span className="text-sm text-slate-600">{date}</span>
}
