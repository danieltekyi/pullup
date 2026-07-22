import { useEffect, useMemo, useState } from 'react'
import { computePhysicsCost, PHYSICS_DEFAULTS, type PhysicsParams } from '@pullup/shared'
import { api, apiErrorMessage } from '../services/api'
import { Button, Card, Input, toast } from '../components/ui'

type PhysicsKey = keyof PhysicsParams

interface Param {
  id: string
  category: string
  key: PhysicsKey
  value: string
  label: string
}

interface ParamMeta {
  id: string
  label: string
  description: string
  step: string
}

const PARAM_META: Record<PhysicsKey, ParamMeta> = {
  fuel_price: {
    id: 'phy_fuel_price',
    label: 'Fuel price',
    description: 'Average pump price in GHS per litre.',
    step: '0.01',
  },
  base_efficiency: {
    id: 'phy_base_efficiency',
    label: 'Base efficiency',
    description: 'Motorbike efficiency in km per litre before cargo load effects.',
    step: '0.1',
  },
  terrain_factor: {
    id: 'phy_terrain',
    label: 'Terrain factor',
    description: 'Multiplier for traffic, hills, and road conditions.',
    step: '0.01',
  },
  alpha: {
    id: 'phy_alpha',
    label: 'Alpha',
    description: 'How strongly cargo weight increases fuel burn.',
    step: '0.01',
  },
  maintenance_rate_per_km: {
    id: 'phy_maint_rate',
    label: 'Maintenance rate / km',
    description: 'Wear-and-tear cost in GHS per kilometre at zero load.',
    step: '0.01',
  },
  beta: {
    id: 'phy_beta',
    label: 'Beta',
    description: 'How strongly cargo weight increases maintenance cost.',
    step: '0.01',
  },
  salary_per_delivery: {
    id: 'phy_salary',
    label: 'Salary / delivery',
    description: 'Fixed rider compensation allocated to each delivery.',
    step: '0.01',
  },
  overhead_per_delivery: {
    id: 'phy_overhead',
    label: 'Overhead / delivery',
    description: 'Fixed dispatch, support, and platform overhead per trip.',
    step: '0.01',
  },
  max_payload: {
    id: 'phy_max_payload',
    label: 'Max payload',
    description: 'Cargo weight where load_fraction reaches 100%.',
    step: '0.1',
  },
  profit_margin: {
    id: 'phy_margin',
    label: 'Profit margin',
    description: 'Target gross margin percentage applied to raw cost.',
    step: '0.01',
  },
}

const PARAM_GROUPS: Array<{ title: string; keys: PhysicsKey[] }> = [
  { title: 'Fuel', keys: ['fuel_price', 'base_efficiency', 'terrain_factor', 'alpha'] },
  { title: 'Wear', keys: ['maintenance_rate_per_km', 'beta'] },
  { title: 'Fixed costs', keys: ['salary_per_delivery', 'overhead_per_delivery', 'max_payload'] },
  { title: 'Margin', keys: ['profit_margin'] },
]

const DISTANCE_PRESETS = [5, 10, 20, 30]
const WEIGHT_PRESETS = [1, 5, 10, 20]

function parseNumericValue(value: string | undefined, fallback: number): number {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) ? n : fallback
}

function formatMoney(value: number): string {
  return `GHS ${value.toFixed(2)}`
}

function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits)
}

function buildParamRows(items: Param[]): Param[] {
  const byKey = new Map(items.map(item => [item.key, item]))
  return (Object.keys(PARAM_META) as PhysicsKey[]).map(key => {
    const existing = byKey.get(key)
    return existing ?? {
      id: PARAM_META[key].id,
      category: 'physics',
      key,
      value: String(PHYSICS_DEFAULTS[key]),
      label: PARAM_META[key].label,
    }
  })
}

function buildPhysicsParams(params: Param[], drafts: Record<string, string>): PhysicsParams {
  const byKey = new Map(params.map(param => [param.key, param]))

  return {
    fuel_price: parseNumericValue(drafts[(byKey.get('fuel_price') ?? { id: PARAM_META.fuel_price.id }).id], PHYSICS_DEFAULTS.fuel_price),
    base_efficiency: parseNumericValue(drafts[(byKey.get('base_efficiency') ?? { id: PARAM_META.base_efficiency.id }).id], PHYSICS_DEFAULTS.base_efficiency),
    max_payload: parseNumericValue(drafts[(byKey.get('max_payload') ?? { id: PARAM_META.max_payload.id }).id], PHYSICS_DEFAULTS.max_payload),
    alpha: parseNumericValue(drafts[(byKey.get('alpha') ?? { id: PARAM_META.alpha.id }).id], PHYSICS_DEFAULTS.alpha),
    maintenance_rate_per_km: parseNumericValue(drafts[(byKey.get('maintenance_rate_per_km') ?? { id: PARAM_META.maintenance_rate_per_km.id }).id], PHYSICS_DEFAULTS.maintenance_rate_per_km),
    beta: parseNumericValue(drafts[(byKey.get('beta') ?? { id: PARAM_META.beta.id }).id], PHYSICS_DEFAULTS.beta),
    terrain_factor: parseNumericValue(drafts[(byKey.get('terrain_factor') ?? { id: PARAM_META.terrain_factor.id }).id], PHYSICS_DEFAULTS.terrain_factor),
    salary_per_delivery: parseNumericValue(drafts[(byKey.get('salary_per_delivery') ?? { id: PARAM_META.salary_per_delivery.id }).id], PHYSICS_DEFAULTS.salary_per_delivery),
    overhead_per_delivery: parseNumericValue(drafts[(byKey.get('overhead_per_delivery') ?? { id: PARAM_META.overhead_per_delivery.id }).id], PHYSICS_DEFAULTS.overhead_per_delivery),
    profit_margin: parseNumericValue(drafts[(byKey.get('profit_margin') ?? { id: PARAM_META.profit_margin.id }).id], PHYSICS_DEFAULTS.profit_margin),
  }
}

export default function PhysicsPricingPage() {
  const [params, setParams] = useState<Param[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [distance, setDistance] = useState('10')
  const [weight, setWeight] = useState('1')

  async function load() {
    setLoading(true)
    try {
      const response = await api.get<{ items: Param[] }>('/api/params?category=physics')
      const rows = buildParamRows(response.data.items)
      setParams(rows)
      setDrafts(Object.fromEntries(rows.map(param => [param.id, param.value])))
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const currentParams = useMemo(() => buildPhysicsParams(params, drafts), [params, drafts])
  const distanceValue = Math.max(0, parseNumericValue(distance, 0))
  const weightValue = Math.max(0, parseNumericValue(weight, 0))
  const liveBreakdown = useMemo(
    () => computePhysicsCost(distanceValue, weightValue, currentParams),
    [distanceValue, weightValue, currentParams],
  )

  const loadFraction = Math.min(
    currentParams.max_payload > 0 ? weightValue / currentParams.max_payload : 0,
    1,
  )
  const fuelRatePerKm =
    (currentParams.fuel_price / Math.max(currentParams.base_efficiency, 1))
    * (1 + currentParams.alpha * loadFraction)
    * currentParams.terrain_factor
  const wearRatePerKm =
    currentParams.maintenance_rate_per_km
    * (1 + currentParams.beta * loadFraction)
    * currentParams.terrain_factor

  async function saveParam(param: Param) {
    setSavingId(param.id)
    try {
      await api.put(`/api/params/${param.id}`, { value: drafts[param.id] })
      const nextValue = drafts[param.id]
      setParams(current => current.map(item => item.id === param.id ? { ...item, value: nextValue } : item))
      toast.success(`${PARAM_META[param.key].label} saved`)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <div className="p-8 text-slate-400 animate-pulse">Loading physics pricing…</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Physics Pricing</h1>
        <p className="text-sm text-slate-500 mt-1">Tune the delivery equation, save each parameter, and preview live pricing instantly.</p>
      </div>

      <Card title="1. The equation">
        <p className="text-sm text-slate-500 mb-4">
          The customer charge is derived from fuel burn, maintenance wear, fixed delivery costs, and the chosen profit margin.
        </p>
        <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-4 text-xs leading-6 text-slate-100">
{`Charge = C ÷ (1 − profit_margin%)

where:
  C = d × [fuel_rate(w) + wear_rate(w)] + fixed_costs

  fuel_rate(w) = (fuel_price ÷ efficiency) × (1 + α × load_fraction) × terrain
  wear_rate(w) = maintenance_rate × (1 + β × load_fraction) × terrain
  load_fraction = weight ÷ max_payload
  fixed_costs = salary + overhead

Current values:
  fuel_price = ${formatNumber(currentParams.fuel_price)} GHS/L
  efficiency = ${formatNumber(currentParams.base_efficiency)} km/L
  terrain = ${formatNumber(currentParams.terrain_factor)}
  α = ${formatNumber(currentParams.alpha)}
  maintenance_rate = ${formatNumber(currentParams.maintenance_rate_per_km)} GHS/km
  β = ${formatNumber(currentParams.beta)}
  salary = ${formatNumber(currentParams.salary_per_delivery)} GHS
  overhead = ${formatNumber(currentParams.overhead_per_delivery)} GHS
  max_payload = ${formatNumber(currentParams.max_payload)} kg
  profit_margin = ${formatNumber(currentParams.profit_margin)}%

Live example for d = ${formatNumber(distanceValue)} km and w = ${formatNumber(weightValue)} kg:
  load_fraction = ${formatNumber(weightValue)} ÷ ${formatNumber(currentParams.max_payload)} = ${formatNumber(loadFraction, 4)}
  fuel_rate = (${formatNumber(currentParams.fuel_price)} ÷ ${formatNumber(currentParams.base_efficiency)}) × (1 + ${formatNumber(currentParams.alpha)} × ${formatNumber(loadFraction, 4)}) × ${formatNumber(currentParams.terrain_factor)} = ${formatNumber(fuelRatePerKm, 4)} GHS/km
  wear_rate = ${formatNumber(currentParams.maintenance_rate_per_km)} × (1 + ${formatNumber(currentParams.beta)} × ${formatNumber(loadFraction, 4)}) × ${formatNumber(currentParams.terrain_factor)} = ${formatNumber(wearRatePerKm, 4)} GHS/km
  fixed_costs = ${formatNumber(currentParams.salary_per_delivery)} + ${formatNumber(currentParams.overhead_per_delivery)} = ${formatNumber(liveBreakdown.fixedCost)} GHS
  C = ${formatNumber(distanceValue)} × (${formatNumber(fuelRatePerKm, 4)} + ${formatNumber(wearRatePerKm, 4)}) + ${formatNumber(liveBreakdown.fixedCost)} = ${formatNumber(liveBreakdown.rawCost)} GHS
  Charge = ${formatNumber(liveBreakdown.rawCost)} ÷ (1 − ${formatNumber(currentParams.profit_margin)}%) = ${formatNumber(liveBreakdown.charge)} GHS`}
        </pre>
      </Card>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">2. Parameters editor</h2>
          <p className="text-sm text-slate-500 mt-1">Each row saves independently to D1 using the single-parameter admin endpoint.</p>
        </div>
        {PARAM_GROUPS.map(group => (
          <Card key={group.title} title={group.title}>
            <div className="space-y-3">
              {group.keys.map(key => {
                const param = params.find(item => item.key === key)
                if (!param) return null
                const meta = PARAM_META[key]
                const dirty = (drafts[param.id] ?? param.value) !== param.value
                return (
                  <div
                    key={param.id}
                    className="grid gap-3 rounded-2xl border border-slate-200 p-4 xl:grid-cols-[1.2fr_0.7fr_0.9fr_1.7fr_auto]"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{meta.label}</p>
                      <p className="text-xs text-slate-400">{param.key}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current value</p>
                      <p className="mt-1 font-mono text-sm text-slate-700">{param.value}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Input</p>
                      <Input
                        type="number"
                        min="0"
                        step={meta.step}
                        value={drafts[param.id] ?? param.value}
                        onChange={event => setDrafts(current => ({ ...current, [param.id]: event.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Description</p>
                      <p className="mt-1 text-sm text-slate-600">{meta.description}</p>
                    </div>
                    <div className="flex items-start xl:justify-end">
                      <Button
                        size="sm"
                        loading={savingId === param.id}
                        disabled={!dirty}
                        onClick={() => saveParam(param)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title="3. Calculator">
          <p className="text-sm text-slate-500 mb-4">Live preview uses the current editor values in your browser before you save them.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Distance (km)</label>
              <Input type="number" min="0" step="0.1" value={distance} onChange={event => setDistance(event.target.value)} />
            </div>
            <div>
              <label className="label">Weight (kg)</label>
              <Input type="number" min="0" step="0.1" value={weight} onChange={event => setWeight(event.target.value)} />
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Live customer charge</p>
                <p className="text-xs text-slate-500">{formatNumber(distanceValue)} km · {formatNumber(weightValue)} kg</p>
              </div>
              <p className="text-3xl font-bold text-emerald-700">{formatMoney(liveBreakdown.charge)}</p>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Fuel cost', liveBreakdown.fuelCost],
                ['Wear cost', liveBreakdown.wearCost],
                ['Fixed cost', liveBreakdown.fixedCost],
                ['Raw cost', liveBreakdown.rawCost],
                ['Margin amount', liveBreakdown.marginAmount],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-mono text-slate-800">{formatMoney(value as number)}</dd>
                </div>
              ))}
            </dl>
            {liveBreakdown.overloaded && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Weight exceeds max payload; load impact is capped at 100%.
              </p>
            )}
          </div>
        </Card>

        <Card title="Preset distances">
          <p className="text-sm text-slate-500 mb-4">Quick view for a 1 kg parcel at common delivery distances.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {DISTANCE_PRESETS.map(km => {
              const result = computePhysicsCost(km, 1, currentParams)
              return (
                <div key={km} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{km} km</p>
                  <p className="mt-2 text-2xl font-bold text-brand-700">{formatMoney(result.charge)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Raw {formatMoney(result.rawCost)} · Margin {formatMoney(result.marginAmount)}
                  </p>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <Card title="4. Comparison table (quick reference)">
        <p className="text-sm text-slate-500 mb-4">Cheat sheet for riders and dispatch when checking common parcel sizes.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Distance</th>
                {WEIGHT_PRESETS.map(weightPreset => (
                  <th key={weightPreset} className="px-4 py-3 text-left font-semibold text-slate-600">{weightPreset} kg</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DISTANCE_PRESETS.map(distancePreset => (
                <tr key={distancePreset} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-800">{distancePreset} km</td>
                  {WEIGHT_PRESETS.map(weightPreset => {
                    const result = computePhysicsCost(distancePreset, weightPreset, currentParams)
                    return (
                      <td key={`${distancePreset}-${weightPreset}`} className="px-4 py-3 font-mono text-slate-700">
                        {formatMoney(result.charge)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
