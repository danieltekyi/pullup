import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '../services/api'
import { Button, Card, Field, Input, Table, toast } from '../components/ui'

interface Zone {
  id: string
  name: string
  order: number
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [rates, setRates] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [base, setBase] = useState('')
  const [step, setStep] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [z, r] = await Promise.all([
        api.get<{ items: Zone[] }>('/api/zones'),
        api.get<{ rates: Record<string, number> }>('/api/zones/rates'),
      ])
      setZones(z.data.items.sort((a, b) => a.order - b.order))
      setRates(r.data.rates)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function saveRates() {
    setSaving(true)
    try {
      await api.put('/api/zones/rates', { rates })
      toast.success('Zone rates saved')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function autofill() {
    const b = parseFloat(base)
    const s = parseFloat(step)
    if (isNaN(b) || isNaN(s)) return
    const next: Record<string, number> = { ...rates }
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        next[pairKey(zones[i].id, zones[j].id)] = Math.round((b + Math.abs(zones[i].order - zones[j].order) * s) * 100) / 100
      }
    }
    setRates(next)
    toast.success('Filled matrix from formula')
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>
  if (zones.length < 2)
    return (
      <Card>
        <p className="text-slate-500 text-center">
          Create at least 2 zones to configure a rate matrix.
        </p>
      </Card>
    )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Zones & Rates</h1>
          <p className="text-sm text-slate-500 mt-1">Bidirectional zone-to-zone delivery pricing</p>
        </div>
        <Button loading={saving} onClick={saveRates}>Save matrix</Button>
      </div>

      <Card title="Auto-fill from formula">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Base"><Input value={base} onChange={e => setBase(e.target.value)} placeholder="e.g. 10" /></Field>
          <Field label="Per-ring step"><Input value={step} onChange={e => setStep(e.target.value)} placeholder="e.g. 5" /></Field>
          <Button onClick={autofill} disabled={!base || !step}>Apply formula</Button>
        </div>
      </Card>

      <div className="card overflow-auto">
        <table className="text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Origin → Dest</th>
              {zones.map(z => (
                <th key={z.id} className="px-4 py-3 text-center font-semibold text-slate-600 whitespace-nowrap">
                  {z.name}
                  <div className="text-xs font-normal text-slate-400">Ring {z.order}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zones.map(row => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-semibold text-slate-700 whitespace-nowrap bg-slate-50">{row.name}</td>
                {zones.map(col => {
                  if (row.id === col.id) return <td key={col.id} className="px-4 py-2 text-center text-slate-300">—</td>
                  const key = pairKey(row.id, col.id)
                  const upper = row.id < col.id
                  const val = rates[key]
                  if (upper) {
                    return (
                      <td key={col.id} className="px-2 py-1 text-center">
                        <input
                          type="number"
                          className="input w-24 text-right"
                          value={val ?? ''}
                          onChange={e => {
                            const n = parseFloat(e.target.value)
                            setRates(prev => {
                              const next = { ...prev }
                              if (isNaN(n)) delete next[key]
                              else next[key] = n
                              return next
                            })
                          }}
                        />
                      </td>
                    )
                  }
                  return (
                    <td key={col.id} className="px-4 py-2 text-center text-slate-400 bg-slate-50">
                      {val ?? '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
