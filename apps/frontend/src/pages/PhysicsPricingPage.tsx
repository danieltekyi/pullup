import { useState } from 'react'
import { api, apiErrorMessage } from '../services/api'
import { Button, Card, Field, Input, toast } from '../components/ui'

interface Breakdown {
  fuelCost: number
  wearCost: number
  fixedCost: number
  rawCost: number
  marginAmount: number
  charge: number
  overloaded: boolean
}

export default function PhysicsPricingPage() {
  const [distance, setDistance] = useState('')
  const [weight, setWeight] = useState('')
  const [result, setResult] = useState<Breakdown | null>(null)
  const [loading, setLoading] = useState(false)

  async function calculate() {
    if (!distance || !weight) return toast.warning('Enter distance and weight')
    setLoading(true)
    try {
      const res = await api.post<{ charge: number; breakdown: Breakdown; warning?: string }>('/api/physics-pricing/calculate', {
        distance: Number(distance),
        weight: Number(weight),
      })
      setResult(res.data.breakdown)
      if (res.data.warning) toast.warning(res.data.warning)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Physics Pricing</h1>
        <p className="text-sm text-slate-500 mt-1">Cost model derived from fuel, wear, load, and margin</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Calculate">
          <div className="space-y-3">
            <Field label="Distance (km)">
              <Input type="number" value={distance} onChange={e => setDistance(e.target.value)} />
            </Field>
            <Field label="Weight (kg)">
              <Input type="number" value={weight} onChange={e => setWeight(e.target.value)} />
            </Field>
            <Button fullWidth loading={loading} onClick={calculate}>Calculate charge</Button>
          </div>
        </Card>

        {result && (
          <Card title="Breakdown">
            <dl className="space-y-2 text-sm">
              {[
                ['Fuel cost', result.fuelCost],
                ['Wear cost', result.wearCost],
                ['Fixed cost', result.fixedCost],
                ['Raw cost', result.rawCost],
                ['Margin', result.marginAmount],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between border-b border-slate-100 py-1.5">
                  <dt className="text-slate-500">{l}</dt>
                  <dd className="font-mono">{(v as number).toFixed(2)}</dd>
                </div>
              ))}
              <div className="flex justify-between pt-2 text-lg font-bold text-brand-700">
                <dt>Customer charge</dt>
                <dd className="font-mono">{result.charge.toFixed(2)}</dd>
              </div>
              {result.overloaded && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2">
                  Parcel exceeds max payload — pricing capped at max load
                </p>
              )}
            </dl>
          </Card>
        )}
      </div>
    </div>
  )
}
