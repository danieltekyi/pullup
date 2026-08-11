import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BarChart2, CheckCircle, ChevronRight, Package, Plus } from 'lucide-react'
import { Button, toast } from '../../components/ui'

const DISTANCE_BANDS = ['<5km', '5-10km', '10-20km', '20-30km', '30km+'] as const
type DistanceBand = typeof DISTANCE_BANDS[number]

const ITEM_TYPES = ['Food & Drinks', 'Groceries', 'Clothing / Fashion', 'Electronics', 'Documents', 'Pharmacy / Medicine', 'Other']

// Rough cost estimate: GHS base + GHS/km * distance mid-point
const BAND_KM: Record<DistanceBand, number> = { '<5km': 3, '5-10km': 7.5, '10-20km': 15, '20-30km': 25, '30km+': 35 }
const BASE_GHS = 15
const PER_KM_GHS = 2.5

interface Entry {
  weekLabel: string
  deliveryCount: number
  avgDistanceBand: DistanceBand
  itemTypes: string[]
  issues: string
  submittedAt: string
}

interface CollectionData {
  bizName: string
  contactName: string
  industry: string
  location: string
  createdAt: string
  entries: Entry[]
  reviewRequested: boolean
}

function estimateMonthly(entries: Entry[]): number {
  if (!entries.length) return 0
  const avgDeliveries = entries.reduce((s, e) => s + e.deliveryCount, 0) / entries.length
  const avgKm = entries.reduce((s, e) => s + BAND_KM[e.avgDistanceBand as DistanceBand], 0) / entries.length
  const costPerDelivery = BASE_GHS + avgKm * PER_KM_GHS
  return Math.round(avgDeliveries * 4.33 * costPerDelivery)
}

function weekLabel(offsetWeeks = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + 1 - offsetWeeks * 7) // last Monday
  return `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export default function PartnerDataCollection() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<CollectionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)

  const [entry, setEntry] = useState({
    weekLabel: weekLabel(),
    deliveryCount: 0,
    avgDistanceBand: '5-10km' as DistanceBand,
    itemTypes: [] as string[],
    issues: '',
  })

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/partner-data/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: CollectionData) => { setData(d); setReviewDone(d.reviewRequested) })
      .catch(code => { if (code === 404) setNotFound(true) })
      .finally(() => setLoading(false))
  }, [token])

  function toggleItemType(t: string) {
    setEntry(e => ({
      ...e,
      itemTypes: e.itemTypes.includes(t) ? e.itemTypes.filter(x => x !== t) : [...e.itemTypes, t],
    }))
  }

  async function submitEntry() {
    if (entry.deliveryCount < 0) { toast.error('Enter a valid delivery count'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/partner-data/${token}/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
      if (!res.ok) throw new Error('Failed')
      const updated = await fetch(`/api/public/partner-data/${token}`)
      const newData: CollectionData = await updated.json()
      setData(newData)
      setShowForm(false)
      setEntry({ weekLabel: weekLabel(), deliveryCount: 0, avgDistanceBand: '5-10km', itemTypes: [], issues: '' })
      toast.success('Week logged! 📊')
    } catch {
      toast.error('Could not save. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function requestReview() {
    setReviewSubmitting(true)
    try {
      const res = await fetch(`/api/public/partner-data/${token}/request-review`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      setReviewDone(true)
      toast.success('Review requested! We\'ll be in touch soon.')
    } catch {
      toast.error('Could not submit. Please try again.')
    } finally {
      setReviewSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-violet-50">
        <div className="text-slate-400 animate-pulse">Loading your tracker…</div>
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-brand-50 to-violet-50">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-sm w-full">
          <span className="text-5xl">😕</span>
          <h2 className="text-xl font-bold text-slate-900 mt-4 mb-2">Link not found</h2>
          <p className="text-slate-500 text-sm">This tracker link has expired or is invalid. Contact us at <strong>info@aegisassetllc.com</strong> if you need a new one.</p>
        </div>
      </div>
    )
  }

  const weeksLogged = data.entries.length
  const monthlyEst = estimateMonthly(data.entries)
  const WEEKS_NEEDED = 4
  const progress = Math.min(weeksLogged / WEEKS_NEEDED, 1)
  const canRequestReview = weeksLogged >= WEEKS_NEEDED

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-violet-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2 shadow-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Package size={16} className="text-white" />
        </div>
        <span className="font-bold text-slate-900">PullUp</span>
        <span className="ml-1 text-slate-400">·</span>
        <span className="text-sm text-slate-500">Delivery Tracker</span>
      </header>

      <main className="flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-5">

        {/* Welcome card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">Welcome back</p>
          <h1 className="text-xl font-bold text-slate-900">{data.bizName}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Hi <strong>{data.contactName}</strong>! Log your deliveries weekly to unlock your custom PullUp proposal.
          </p>

          {/* Progress */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>{weeksLogged} / {WEEKS_NEEDED} weeks logged</span>
              <span>{weeksLogged >= WEEKS_NEEDED ? '🎉 Ready for review!' : `${WEEKS_NEEDED - weeksLogged} more to go`}</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all duration-700"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Cost estimate */}
        {weeksLogged > 0 && (
          <div className="bg-gradient-to-r from-brand-600 to-violet-600 rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 size={18} />
              <span className="text-sm font-semibold opacity-90">Estimated Monthly Cost with PullUp</span>
            </div>
            <p className="text-3xl font-bold">GHS {monthlyEst.toLocaleString()}</p>
            <p className="text-xs opacity-70 mt-1">
              Based on {weeksLogged} week{weeksLogged !== 1 ? 's' : ''} of data · Actual pricing set at onboarding
            </p>
          </div>
        )}

        {/* Log week button */}
        {!showForm ? (
          <Button fullWidth size="lg" onClick={() => setShowForm(true)} icon={<Plus size={16} />}>
            Log This Week's Deliveries
          </Button>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
            <h2 className="font-bold text-slate-900">Log a Week</h2>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Week</label>
              <input
                type="text"
                value={entry.weekLabel}
                onChange={e => setEntry(v => ({ ...v, weekLabel: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Total deliveries this week <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={entry.deliveryCount || ''}
                onChange={e => setEntry(v => ({ ...v, deliveryCount: Math.max(0, parseInt(e.target.value) || 0) }))}
                placeholder="e.g. 45"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Average delivery distance</label>
              <div className="flex flex-wrap gap-2">
                {DISTANCE_BANDS.map(band => (
                  <button
                    key={band} type="button"
                    onClick={() => setEntry(v => ({ ...v, avgDistanceBand: band }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                      entry.avgDistanceBand === band
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-600 hover:border-brand-300'
                    }`}
                  >
                    {band}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">What did you deliver? (optional)</label>
              <div className="flex flex-wrap gap-2">
                {ITEM_TYPES.map(t => (
                  <button
                    key={t} type="button"
                    onClick={() => toggleItemType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
                      entry.itemTypes.includes(t)
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-slate-200 text-slate-600 hover:border-violet-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Any issues or challenges? (optional)</label>
              <textarea
                value={entry.issues}
                onChange={e => setEntry(v => ({ ...v, issues: e.target.value }))}
                rows={2}
                placeholder="Late pickups, wrong addresses, customer complaints…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-none px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300"
              >
                Cancel
              </button>
              <Button fullWidth loading={submitting} onClick={submitEntry} icon={<ChevronRight size={14} />}>
                {submitting ? 'Saving…' : 'Save Week'}
              </Button>
            </div>
          </div>
        )}

        {/* Past entries */}
        {data.entries.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-sm">Your Logged Weeks</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {[...data.entries].reverse().map((e, i) => (
                <div key={i} className="px-5 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{e.weekLabel}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {e.deliveryCount} deliveries · {e.avgDistanceBand} avg
                      {e.itemTypes.length > 0 && ` · ${e.itemTypes.slice(0, 2).join(', ')}`}
                    </p>
                    {e.issues && <p className="text-xs text-amber-600 mt-0.5 truncate">⚠ {e.issues}</p>}
                  </div>
                  <div className="text-right flex-none">
                    <p className="text-xs text-slate-400">
                      ~GHS {Math.round(e.deliveryCount * (BASE_GHS + BAND_KM[e.avgDistanceBand as DistanceBand] * PER_KM_GHS))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Request review CTA */}
        <div className={`rounded-2xl border-2 p-5 transition-all ${canRequestReview ? 'border-emerald-400 bg-emerald-50' : 'border-dashed border-slate-300 bg-white opacity-70'}`}>
          {reviewDone ? (
            <div className="text-center space-y-2">
              <CheckCircle className="mx-auto text-emerald-500" size={40} />
              <p className="font-bold text-slate-900">Review Requested! 🎉</p>
              <p className="text-sm text-slate-500">Our team will reach out to you within 24–48 hours with your custom PullUp proposal.</p>
            </div>
          ) : (
            <>
              <p className="font-bold text-slate-900 mb-1">
                {canRequestReview ? '🚀 Ready for your custom proposal!' : `📅 Log ${WEEKS_NEEDED - weeksLogged} more week${WEEKS_NEEDED - weeksLogged !== 1 ? 's' : ''} to unlock`}
              </p>
              <p className="text-sm text-slate-500 mb-4">
                {canRequestReview
                  ? 'You\'ve collected enough data. Request your free onboarding review and cost proposal.'
                  : 'We need at least 4 weeks of data to give you an accurate cost proposal. Keep logging!'}
              </p>
              <Button
                fullWidth
                disabled={!canRequestReview}
                loading={reviewSubmitting}
                onClick={requestReview}
              >
                {canRequestReview ? 'Request Onboarding Review' : `${WEEKS_NEEDED - weeksLogged} more week${WEEKS_NEEDED - weeksLogged !== 1 ? 's' : ''} needed`}
              </Button>
            </>
          )}
        </div>

      </main>

      <footer className="text-center py-4 text-xs text-slate-400">© PullUp Delivery Management</footer>
    </div>
  )
}
