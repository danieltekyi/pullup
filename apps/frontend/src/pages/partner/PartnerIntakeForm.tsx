import { useState, type FormEvent } from 'react'
import { CheckCircle, ChevronRight, ExternalLink, Package } from 'lucide-react'
import { Button, Field, Input, Textarea, toast } from '../../components/ui'
import { api, apiErrorMessage } from '../../services/api'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const INDUSTRIES = [
  { val: 'food',      label: '🍽️ Food & Restaurant' },
  { val: 'grocery',  label: '🛒 Grocery / Supermarket' },
  { val: 'pharmacy', label: '💊 Pharmacy / Health' },
  { val: 'retail',   label: '👗 Retail / Fashion' },
  { val: 'bakery',   label: '🥐 Bakery / Confectionery' },
  { val: 'ecommerce',label: '📦 E-commerce / Online' },
  { val: 'laundry',  label: '👕 Laundry / Dry Cleaning' },
  { val: 'other',    label: '🏢 Other Business' },
]
const LOCATIONS = [
  'Osu / Cantonments', 'East Legon', 'Airport / Dzorwulu', 'Spintex Road',
  'Accra Central / CBD', 'Tema', 'Madina / Adenta', 'Dansoman / Mamprobi',
  'Lapaz / Achimota', 'Kasoa / Weija', 'Kumasi', 'Other',
]

interface FormState {
  bizName: string
  contactName: string
  phone: string
  email: string
  industry: string
  location: string
  hasData: 'yes' | 'no' | ''
  weeklyOrders: number
  deliveryDays: string[]
  avgCharge: number
  budget: number
  dedicated: string
  notes: string
}

const INIT: FormState = {
  bizName: '', contactName: '', phone: '', email: '',
  industry: '', location: '',
  hasData: '',
  weeklyOrders: 20, deliveryDays: [],
  avgCharge: 50, budget: 2000,
  dedicated: '', notes: '',
}

export default function PartnerIntakeForm() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormState>(INIT)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [dataCollectionUrl, setDataCollectionUrl] = useState('')
  const [dataCollectionRequired, setDataCollectionRequired] = useState(false)

  const TOTAL = 5

  function set(field: keyof FormState, val: unknown) {
    setForm(f => ({ ...f, [field]: val }))
    setErrors(e => ({ ...e, [field]: '' }))
  }

  function toggleDay(d: string) {
    setForm(f => ({
      ...f,
      deliveryDays: f.deliveryDays.includes(d)
        ? f.deliveryDays.filter(x => x !== d)
        : [...f.deliveryDays, d],
    }))
    setErrors(e => ({ ...e, deliveryDays: '' }))
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (step === 1) {
      if (!form.bizName.trim())    errs.bizName = 'Business name is required'
      if (!form.contactName.trim()) errs.contactName = 'Your name is required'
      if (form.phone.replace(/\D/g,'').length < 9) errs.phone = 'Valid phone number required'
    }
    if (step === 2 && !form.industry)  errs.industry = 'Select your industry'
    if (step === 3 && !form.location)  errs.location = 'Select your area'
    if (step === 4) {
      if (!form.hasData) errs.hasData = 'Please select an option'
      if (form.hasData === 'yes' && form.deliveryDays.length === 0) errs.deliveryDays = 'Select at least one day'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await api.post<{ dataCollectionRequired?: boolean; dataCollectionUrl?: string }>('/api/public/partner-intake', {
        ...form,
        hasData: form.hasData === 'yes',
        source: 'partner-intake-form',
        submittedAt: new Date().toISOString(),
      })
      if (res.data.dataCollectionRequired) {
        setDataCollectionRequired(true)
        setDataCollectionUrl(res.data.dataCollectionUrl || '')
      }
      setDone(true)
    } catch (err) {
      toast.error(apiErrorMessage(err) || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function next(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return
    if (step === TOTAL) { handleSubmit(); return }
    setStep(s => s + 1)
    window.scrollTo(0, 0)
  }

  if (done) {
    if (dataCollectionRequired) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-amber-50 to-violet-50">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-sm w-full">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-amber-100 flex items-center justify-center">
                <span className="text-3xl">📊</span>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">One more step!</h2>
            <p className="text-slate-500 text-sm mb-4">
              Hi <strong>{form.contactName}</strong>! Since you're just starting out, we've sent you a
              free <strong>delivery tracker link</strong> to <strong>{form.email || form.phone}</strong>.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-5 space-y-2 text-sm">
              <p className="font-semibold text-amber-800">Here's what happens next:</p>
              <p className="text-amber-700">📋 Log your deliveries each week (2 min)</p>
              <p className="text-amber-700">📊 See your estimated monthly cost grow</p>
              <p className="text-amber-700">🚀 After 4 weeks, request your PullUp proposal</p>
            </div>
            {dataCollectionUrl && (
              <a
                href={dataCollectionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl mb-3 transition-colors"
              >
                <ExternalLink size={15} />
                Open My Delivery Tracker
              </a>
            )}
            <button
              onClick={() => { setDone(false); setStep(1); setForm(INIT); setDataCollectionRequired(false); setDataCollectionUrl('') }}
              className="text-sm text-brand-600 hover:underline"
            >
              Submit another enquiry
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-brand-50 to-violet-50">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-sm w-full">
          <div className="flex justify-center mb-4">
            <CheckCircle className="text-emerald-500" size={56} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">We got it! 🎉</h2>
          <p className="text-slate-500 text-sm">
            Thanks, <strong>{form.contactName}</strong>! We'll review your details and reach out to
            <strong> {form.phone}</strong> within 24 hours with a custom proposal.
          </p>
          <button
            onClick={() => { setDone(false); setStep(1); setForm(INIT) }}
            className="mt-6 text-sm text-brand-600 hover:underline"
          >
            Submit another enquiry
          </button>
        </div>
      </div>
    )
  }

  const progress = ((step - 1) / TOTAL) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-violet-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2 shadow-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Package size={16} className="text-white" />
        </div>
        <span className="font-bold text-slate-900">PullUp</span>
        <span className="ml-auto text-xs text-slate-400">{step} of {TOTAL}</span>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Form */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <form onSubmit={next} className="bg-white rounded-2xl shadow-lg p-6 space-y-5">

            {/* Step 1 — Business info */}
            {step === 1 && (
              <>
                <div>
                  <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">Step 1 / {TOTAL}</p>
                  <h2 className="text-xl font-bold text-slate-900">Tell us about your business</h2>
                  <p className="text-sm text-slate-500 mt-1">We'll use this to prepare your custom delivery proposal.</p>
                </div>
                <Field label="Business name" error={errors.bizName} required>
                  <Input value={form.bizName} onChange={e => set('bizName', e.target.value)} placeholder="e.g. Kofi's Kitchen" autoFocus />
                </Field>
                <Field label="Your name" error={errors.contactName} required>
                  <Input value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Your full name" />
                </Field>
                <Field label="Phone number" error={errors.phone} required>
                  <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+233 20 000 0000" type="tel" />
                </Field>
                <Field label="Email address (optional)">
                  <Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@business.com" type="email" />
                </Field>
              </>
            )}

            {/* Step 2 — Industry */}
            {step === 2 && (
              <>
                <div>
                  <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">Step 2 / {TOTAL}</p>
                  <h2 className="text-xl font-bold text-slate-900">What type of business?</h2>
                  <p className="text-sm text-slate-500 mt-1">Helps us recommend the right rider setup.</p>
                </div>
                {errors.industry && <p className="text-sm text-red-500">{errors.industry}</p>}
                <div className="grid grid-cols-2 gap-2">
                  {INDUSTRIES.map(ind => (
                    <button
                      key={ind.val} type="button"
                      onClick={() => set('industry', ind.val)}
                      className={`text-left px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.industry === ind.val
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-700 hover:border-brand-300'
                      }`}
                    >
                      {ind.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 3 — Location */}
            {step === 3 && (
              <>
                <div>
                  <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">Step 3 / {TOTAL}</p>
                  <h2 className="text-xl font-bold text-slate-900">Where are you based?</h2>
                  <p className="text-sm text-slate-500 mt-1">We'll confirm rider availability in your area.</p>
                </div>
                {errors.location && <p className="text-sm text-red-500">{errors.location}</p>}
                <div className="grid grid-cols-2 gap-2">
                  {LOCATIONS.map(loc => (
                    <button
                      key={loc} type="button"
                      onClick={() => set('location', loc)}
                      className={`text-left px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.location === loc
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-700 hover:border-brand-300'
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 4 — Volume & schedule */}
            {step === 4 && (
              <>
                <div>
                  <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">Step 4 / {TOTAL}</p>
                  <h2 className="text-xl font-bold text-slate-900">Delivery volume & schedule</h2>
                  <p className="text-sm text-slate-500 mt-1">Helps us size the right rider capacity for you.</p>
                </div>

                {/* hasData question */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Do you currently track your delivery volumes? <span className="text-red-500">*</span>
                  </label>
                  {errors.hasData && <p className="text-sm text-red-500 mb-1">{errors.hasData}</p>}
                  <div className="space-y-2">
                    {[
                      { val: 'yes', emoji: '✅', label: 'Yes — I know my weekly delivery numbers', sub: 'Great! Fill in the details below.' },
                      { val: 'no',  emoji: '🆕', label: 'No — I\'m just starting or don\'t track this', sub: 'No problem! We\'ll send you a free tracker.' },
                    ].map(opt => (
                      <button
                        key={opt.val} type="button"
                        onClick={() => { set('hasData', opt.val); setErrors(e => ({ ...e, hasData: '' })) }}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          form.hasData === opt.val
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-slate-200 text-slate-700 hover:border-brand-300'
                        }`}
                      >
                        <span className="font-semibold">{opt.emoji} {opt.label}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Only show volume fields if they have data */}
                {form.hasData === 'yes' && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Weekly deliveries: <span className="text-brand-600">{form.weeklyOrders}</span>
                      </label>
                      <input
                        type="range" min={5} max={500} step={5}
                        value={form.weeklyOrders}
                        onChange={e => set('weeklyOrders', Number(e.target.value))}
                        className="w-full accent-brand-600"
                      />
                      <div className="flex justify-between text-xs text-slate-400 mt-1"><span>5</span><span>500+</span></div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Which days do you operate?</label>
                      {errors.deliveryDays && <p className="text-sm text-red-500 mb-1">{errors.deliveryDays}</p>}
                      <div className="flex gap-2 flex-wrap">
                        {DAYS.map(d => (
                          <button
                            key={d} type="button"
                            onClick={() => toggleDay(d)}
                            className={`w-12 h-12 rounded-full text-xs font-bold border-2 transition-all ${
                              form.deliveryDays.includes(d)
                                ? 'bg-brand-600 border-brand-600 text-white'
                                : 'border-slate-200 text-slate-600 hover:border-brand-400'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Average delivery charge you currently charge customers: <span className="text-brand-600">GHS {form.avgCharge}</span>
                      </label>
                      <input
                        type="range" min={10} max={300} step={5}
                        value={form.avgCharge}
                        onChange={e => set('avgCharge', Number(e.target.value))}
                        className="w-full accent-brand-600"
                      />
                    </div>
                  </>
                )}

                {form.hasData === 'no' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <p className="font-semibold mb-1">📊 Free Delivery Tracker — Here's how it works:</p>
                    <ul className="space-y-1 text-amber-700">
                      <li>✔ After you submit, we'll email you a personal tracker link</li>
                      <li>✔ Log your deliveries weekly (takes ~2 minutes)</li>
                      <li>✔ After 4 weeks, request your custom PullUp cost proposal</li>
                      <li>✔ We use your real data to offer you the best pricing</li>
                    </ul>
                    <p className="mt-2 text-amber-600 text-xs">Make sure your email is filled in on Step 1 to receive the link.</p>
                  </div>
                )}
              </>
            )}

            {/* Step 5 — Budget & notes */}
            {step === 5 && (
              <>
                <div>
                  <p className="text-xs font-bold text-brand-600 uppercase tracking-wide mb-1">Step 5 / {TOTAL}</p>
                  <h2 className="text-xl font-bold text-slate-900">Almost done!</h2>
                  <p className="text-sm text-slate-500 mt-1">Tell us your budget and anything else we should know.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Monthly delivery budget: <span className="text-brand-600">GHS {form.budget.toLocaleString()}</span>
                  </label>
                  <input
                    type="range" min={200} max={20000} step={200}
                    value={form.budget}
                    onChange={e => set('budget', Number(e.target.value))}
                    className="w-full accent-brand-600"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1"><span>GHS 200</span><span>GHS 20k+</span></div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Dedicated riders?</label>
                  <div className="space-y-2">
                    {[
                      { val: 'yes',   label: '✅ Yes — riders dedicated to my business only' },
                      { val: 'maybe', label: '🤔 Open to it if priced right' },
                      { val: 'no',    label: '🔀 Shared pool is fine' },
                    ].map(opt => (
                      <button
                        key={opt.val} type="button"
                        onClick={() => set('dedicated', opt.val)}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          form.dedicated === opt.val
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-slate-200 text-slate-700 hover:border-brand-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Field label="Anything else? (optional)">
                  <Textarea
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    placeholder="Special requirements, current issues, questions..."
                    rows={3}
                  />
                </Field>
              </>
            )}

            {/* Nav */}
            <div className="flex gap-3 pt-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => { setStep(s => s - 1); window.scrollTo(0, 0) }}
                  className="flex-none px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-600 hover:border-slate-300"
                >
                  Back
                </button>
              )}
              <Button type="submit" fullWidth size="lg" loading={submitting} icon={step < TOTAL ? <ChevronRight size={16} /> : undefined}>
                {submitting ? 'Submitting…' : step === TOTAL ? '🚀 Submit' : 'Continue'}
              </Button>
            </div>
          </form>
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-slate-400">© PullUp Delivery Management</footer>
    </div>
  )
}
