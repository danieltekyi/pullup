import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '../services/api'
import { Card, Field, Input, Select, Button, Table, toast } from '../components/ui'
import type { Expenditure } from '@pullup/shared'

interface Report {
  totalRevenue: number
  totalExpenditures: number
  netRevenue: number
  byCategory: Record<string, number>
  revenueBreakdown: { suspense: number; receivable: number; paid: number; untagged: number }
  codOutstanding: number
}

export default function FinancePage() {
  const [items, setItems] = useState<Expenditure[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [form, setForm] = useState({ category: 'fuel', description: '', amount: '', date: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [e, r] = await Promise.all([
        api.get<{ items: Expenditure[] }>('/api/finance/expenditures'),
        api.get<Report>('/api/finance/report'),
      ])
      setItems(e.data.items)
      setReport(r.data)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    }
  }

  useEffect(() => { load() }, [])

  async function submit() {
    if (!form.description || !form.amount) return toast.warning('Description and amount required')
    setSaving(true)
    try {
      await api.post('/api/finance/expenditures', { ...form, amount: Number(form.amount) })
      setForm({ category: 'fuel', description: '', amount: '', date: new Date().toISOString().slice(0, 10) })
      toast.success('Expenditure added')
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Finance</h1>
        <p className="text-sm text-slate-500 mt-1">Revenue, expenses, and COD reconciliation</p>
      </div>

      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { l: 'Revenue', v: report.totalRevenue, c: 'text-emerald-600' },
            { l: 'Expenses', v: report.totalExpenditures, c: 'text-red-600' },
            { l: 'Net', v: report.netRevenue, c: report.netRevenue >= 0 ? 'text-emerald-600' : 'text-red-600' },
            { l: 'COD Outstanding', v: report.codOutstanding, c: 'text-amber-600' },
          ].map(k => (
            <Card key={k.l}>
              <p className="text-xs uppercase text-slate-500 font-semibold">{k.l}</p>
              <p className={'text-2xl font-bold mt-1 ' + k.c}>{k.v.toLocaleString()}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Add expenditure" className="lg:col-span-1">
          <div className="space-y-3">
            <Field label="Category">
              <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {['fuel', 'maintenance', 'salary', 'rent', 'utility', 'other'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Description">
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Field>
            <Field label="Amount">
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Field>
            <Button fullWidth loading={saving} onClick={submit}>Add expenditure</Button>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <Table
            rows={items}
            rowKey={e => e.id}
            emptyMessage="No expenditures yet"
            columns={[
              { key: 'date', header: 'Date', render: e => e.date },
              { key: 'cat', header: 'Category', render: e => e.category },
              { key: 'desc', header: 'Description', render: e => e.description },
              { key: 'amt', header: 'Amount', render: e => <span className="font-semibold">{e.amount.toLocaleString()}</span> },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
