import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Package, Users, DollarSign, Clock, AlertCircle } from 'lucide-react'
import { Card } from '../components/ui'
import { api } from '../services/api'

interface Summary {
  totalOrders: number
  pendingOrders: number
  deliveredOrders: number
  inFlightOrders: number
  activeRiders: number
  totalRevenue: number
  totalExpenditures: number
  netRevenue: number
  codOutstanding: number
}

interface Point {
  label: string
  count: number
  revenue: number
}

const periods = ['daily', 'weekly', 'monthly', 'yearly'] as const

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof Package; color: string }) {
  return (
    <div className="card p-5 flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      </div>
      <div className="p-2.5 rounded-lg" style={{ background: color + '20' }}>
        <Icon size={22} style={{ color }} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [chart, setChart] = useState<Point[]>([])
  const [period, setPeriod] = useState<typeof periods[number]>('daily')

  useEffect(() => {
    api.get<Summary>('/api/analytics/summary').then(r => setSummary(r.data))
  }, [])

  useEffect(() => {
    api.get<Point[]>(`/api/analytics/orders?period=${period}`).then(r => setChart(r.data))
  }, [period])

  const fmt = (n: number) => n.toLocaleString()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Operational overview for your branch</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Orders" value={fmt(summary?.totalOrders ?? 0)} icon={Package} color="#4f46e5" />
        <Kpi label="In Flight" value={fmt(summary?.inFlightOrders ?? 0)} icon={Clock} color="#f59e0b" />
        <Kpi label="Active Riders" value={fmt(summary?.activeRiders ?? 0)} icon={Users} color="#0891b2" />
        <Kpi label="Net Revenue" value={fmt(summary?.netRevenue ?? 0)} icon={DollarSign} color="#16a34a" />
      </div>

      {summary?.codOutstanding ? (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3">
          <AlertCircle size={18} />
          <p className="text-sm">
            <strong>{fmt(summary.codOutstanding)}</strong> in COD is uncollected. Reconcile with riders soon.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          className="lg:col-span-2"
          title="Orders Overview"
          action={
            <div className="flex gap-1">
              {periods.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={
                    'px-3 py-1 rounded-full text-xs font-semibold ' +
                    (period === p ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }
                >
                  {p}
                </button>
              ))}
            </div>
          }
        >
          {chart.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chart}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Orders" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-72 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
          )}
        </Card>

        <Card title="Financial Summary">
          <div className="space-y-3">
            {[
              { label: 'Revenue', value: summary?.totalRevenue ?? 0, color: 'text-emerald-600' },
              { label: 'Expenses', value: summary?.totalExpenditures ?? 0, color: 'text-red-600' },
              {
                label: 'Net Profit',
                value: summary?.netRevenue ?? 0,
                color: (summary?.netRevenue ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600',
              },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-600">{row.label}</span>
                <span className={'text-sm font-bold ' + row.color}>{fmt(row.value)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
