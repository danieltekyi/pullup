import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '../services/api'
import { Button, Card, Field, Input, Modal, toast } from '../components/ui'
import { Plus, Trash2, RefreshCw } from 'lucide-react'

interface Zone { id: string; name: string; order: number }
interface Param { id: string; key: string; value: string; label: string }

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [rates, setRates] = useState<Record<string, number>>({})
  const [params, setParams] = useState<Param[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [base, setBase] = useState('25')
  const [step, setStep] = useState('10')

  // Zone add modal
  const [addModal, setAddModal] = useState(false)
  const [newZoneName, setNewZoneName] = useState('')
  const [newZoneRing, setNewZoneRing] = useState('1')
  const [addingZone, setAddingZone] = useState(false)

  // Param editing
  const [editingParam, setEditingParam] = useState<Record<string, string>>({})
  const [savingParam, setSavingParam] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [z, r, p] = await Promise.all([
        api.get<{ items: Zone[] }>('/api/zones'),
        api.get<{ rates: Record<string, number> }>('/api/zones/rates'),
        api.get<{ items: Param[] }>('/api/params?category=delivery'),
      ])
      setZones(z.data.items.sort((a, b) => a.order - b.order))
      setRates(r.data.rates)
      setParams(p.data.items)
      const init: Record<string, string> = {}
      p.data.items.forEach(p => { init[p.id] = p.value })
      setEditingParam(init)
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function saveRates() {
    setSaving(true)
    try {
      await api.put('/api/zones/rates', { rates })
      toast.success('Zone rates saved ✅')
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setSaving(false) }
  }

  function autofill() {
    const b = parseFloat(base), s = parseFloat(step)
    if (isNaN(b) || isNaN(s)) return
    const next: Record<string, number> = {}
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        next[pairKey(zones[i].id, zones[j].id)] =
          Math.round((b + Math.abs(zones[i].order - zones[j].order) * s) * 100) / 100
      }
    }
    setRates(next)
    toast.success('Matrix filled from formula — click Save to apply')
  }

  async function addZone() {
    if (!newZoneName.trim()) return
    setAddingZone(true)
    try {
      await api.post('/api/zones', {
        id: `zone_${newZoneName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`,
        name: newZoneName.trim(),
        ord: parseInt(newZoneRing) || 1,
        branchId: 'default',
      })
      toast.success('Zone added')
      setAddModal(false)
      setNewZoneName('')
      setNewZoneRing('1')
      load()
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setAddingZone(false) }
  }

  async function deleteZone(z: Zone) {
    if (!confirm(`Delete zone "${z.name}"?`)) return
    try {
      await api.delete(`/api/zones/${z.id}`)
      toast.success('Zone deleted')
      load()
    } catch (err) { toast.error(apiErrorMessage(err)) }
  }

  async function saveParam(p: Param) {
    setSavingParam(p.id)
    try {
      await api.put(`/api/params/${p.id}`, { value: editingParam[p.id] })
      toast.success(`${p.label} updated`)
      load()
    } catch (err) { toast.error(apiErrorMessage(err)) }
    finally { setSavingParam(null) }
  }

  if (loading) return <div className="p-8 text-slate-400 animate-pulse">Loading zones…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Zones & Rates</h1>
          <p className="text-sm text-slate-500 mt-1">Delivery zones and pricing matrix for Accra</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={load}>Refresh</Button>
          <Button icon={<Plus size={14} />} onClick={() => setAddModal(true)}>Add Zone</Button>
        </div>
      </div>

      {/* Delivery Pricing Params */}
      {params.length > 0 && (
        <Card title="Delivery pricing (distance-based)">
          <p className="text-xs text-slate-400 mb-4">Used for auto-cost calculation on the customer order form and bulk import.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {params.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-500 truncate">{p.label}</p>
                  <input
                    type="number"
                    className="input w-full mt-0.5 text-sm"
                    value={editingParam[p.id] ?? p.value}
                    onChange={e => setEditingParam(prev => ({ ...prev, [p.id]: e.target.value }))}
                    step="0.01"
                    min="0"
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={savingParam === p.id}
                  onClick={() => saveParam(p)}
                  disabled={editingParam[p.id] === p.value}
                >
                  Save
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Zones list */}
      <Card title={`Zones (${zones.length})`}>
        {zones.length === 0 ? (
          <p className="text-slate-400 text-sm">No zones yet — click "Add Zone" to create your first delivery zone.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {zones.map(z => (
              <div key={z.id} className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-semibold">{z.name}</p>
                  <p className="text-xs text-slate-400">Ring {z.order}</p>
                </div>
                <button onClick={() => deleteZone(z)} className="text-red-300 hover:text-red-600 ml-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Rate Matrix */}
      {zones.length >= 2 && (
        <>
          <Card title="Auto-fill matrix from ring formula">
            <p className="text-xs text-slate-400 mb-3">Base = same-ring rate, Step = added per ring difference. Example: base=25, step=10 → same ring=25, 1 ring apart=35, 2 rings=45…</p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Base (GHS)"><Input value={base} onChange={e => setBase(e.target.value)} placeholder="25" className="w-24" /></Field>
              <Field label="Per-ring step (GHS)"><Input value={step} onChange={e => setStep(e.target.value)} placeholder="10" className="w-24" /></Field>
              <Button onClick={autofill}>Apply formula</Button>
            </div>
          </Card>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Rate matrix (GHS)</h3>
              <Button loading={saving} onClick={saveRates}>Save all rates</Button>
            </div>
            <div className="card overflow-auto">
              <table className="text-sm w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">From ↓ / To →</th>
                    {zones.map(z => (
                      <th key={z.id} className="px-3 py-3 text-center font-semibold text-slate-600 whitespace-nowrap text-xs">
                        {z.name}<br /><span className="font-normal text-slate-400">Ring {z.order}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zones.map(row => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap bg-slate-50 text-xs">{row.name}</td>
                      {zones.map(col => {
                        if (row.id === col.id) return <td key={col.id} className="px-3 py-2 text-center text-slate-200 bg-slate-50">—</td>
                        const key = pairKey(row.id, col.id)
                        const isUpper = row.id < col.id
                        const val = rates[key]
                        if (isUpper) {
                          return (
                            <td key={col.id} className="px-2 py-1 text-center">
                              <input
                                type="number"
                                className="input w-20 text-right text-sm"
                                value={val ?? ''}
                                placeholder="—"
                                onChange={e => {
                                  const n = parseFloat(e.target.value)
                                  setRates(prev => { const next = { ...prev }; if (isNaN(n)) delete next[key]; else next[key] = n; return next })
                                }}
                              />
                            </td>
                          )
                        }
                        return <td key={col.id} className="px-3 py-2 text-center text-slate-400 bg-slate-50 text-sm">{val ?? '—'}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">Upper triangle = editable. Lower triangle = mirror. Rate is bidirectional (same from both directions).</p>
          </div>
        </>
      )}

      {/* Add Zone Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add delivery zone"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={addZone} loading={addingZone} disabled={!newZoneName.trim()}>Add zone</Button>
          </div>
        }>
        <div className="space-y-4">
          <Field label="Zone name" required hint="e.g. East Legon, Accra CBD, Spintex">
            <Input value={newZoneName} onChange={e => setNewZoneName(e.target.value)} placeholder="East Legon" autoFocus />
          </Field>
          <Field label="Ring / distance tier" hint="1 = city centre, higher = further out">
            <Input type="number" min="1" max="10" value={newZoneRing} onChange={e => setNewZoneRing(e.target.value)} />
          </Field>
          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">Current rings:</p>
            {[...new Set(zones.map(z => z.order))].sort().map(r => (
              <p key={r}>Ring {r}: {zones.filter(z => z.order === r).map(z => z.name).join(', ')}</p>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
