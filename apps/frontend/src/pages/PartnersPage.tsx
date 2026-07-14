import { useEffect, useState } from 'react'
import type { Partner } from '@pullup/shared'
import { api, apiErrorMessage } from '../services/api'
import { Badge, Button, Table, toast } from '../components/ui'
import { Building2, Download } from 'lucide-react'

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchingId, setFetchingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<{ items: Partner[] }>('/api/partners')
      setPartners(res.data.items)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function fetchNow(id: string) {
    setFetchingId(id)
    try {
      const r = await api.post<{ imported: number; skipped: number }>(`/api/partners/${id}/fetch`)
      toast.success(`Imported ${r.data.imported} (skipped ${r.data.skipped})`)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setFetchingId(null)
    }
  }

  async function toggle(p: Partner) {
    try {
      await api.put(`/api/partners/${p.id}`, { active: !p.active })
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Partners</h1>
          <p className="text-sm text-slate-500 mt-1">API integrations that push orders into PullUp</p>
        </div>
        <Button icon={<Building2 size={14} />}>Add Partner</Button>
      </div>
      <Table
        loading={loading}
        rows={partners}
        rowKey={p => p.id}
        emptyMessage="No partners configured. Add one to start ingesting orders."
        columns={[
          { key: 'name', header: 'Name', render: p => <span className="font-semibold">{p.name}</span> },
          {
            key: 'url',
            header: 'GET URL',
            render: p => (
              <span className="text-xs text-slate-500 font-mono max-w-[280px] truncate block" title={p.getUrl}>
                {p.getUrl ?? '—'}
              </span>
            ),
          },
          {
            key: 'active',
            header: 'Active',
            render: p => (
              <button onClick={() => toggle(p)}>
                <Badge variant={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
              </button>
            ),
          },
          {
            key: 'last',
            header: 'Last fetched',
            render: p => (
              <span className="text-xs text-slate-500">
                {p.lastFetchedAt ? new Date(p.lastFetchedAt).toLocaleString() : 'Never'}
              </span>
            ),
          },
          {
            key: 'actions',
            header: 'Actions',
            render: p => (
              <Button
                size="sm"
                variant="secondary"
                loading={fetchingId === p.id}
                icon={<Download size={12} />}
                onClick={() => fetchNow(p.id)}
              >
                Fetch now
              </Button>
            ),
          },
        ]}
      />
    </div>
  )
}
