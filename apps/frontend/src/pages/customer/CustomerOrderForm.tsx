import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, MapPin, Truck } from 'lucide-react'
import { Button, Field, Input, Textarea, toast } from '../../components/ui'
import { api, apiErrorMessage } from '../../services/api'

interface OrderFormState {
  senderName: string
  senderPhone: string
  senderAddress: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  description: string
  weight: string
  paymentMethod: 'cod' | 'prepaid'
  specialInstructions: string
}

const initialForm: OrderFormState = {
  senderName: '',
  senderPhone: '',
  senderAddress: '',
  recipientName: '',
  recipientPhone: '',
  recipientAddress: '',
  description: '',
  weight: '',
  paymentMethod: 'cod',
  specialInstructions: '',
}

export default function CustomerOrderForm() {
  const nav = useNavigate()
  const [form, setForm] = useState<OrderFormState>(initialForm)
  const [loading, setLoading] = useState(false)

  function update<K extends keyof OrderFormState>(key: K, value: OrderFormState[K]) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function onInputChange(key: keyof OrderFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      update(key, event.target.value as OrderFormState[typeof key])
    }
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const payload = {
        senderName: form.senderName.trim(),
        senderPhone: form.senderPhone.trim(),
        senderAddress: form.senderAddress.trim(),
        recipientName: form.recipientName.trim(),
        recipientPhone: form.recipientPhone.trim(),
        recipientAddress: form.recipientAddress.trim(),
        description: form.description.trim(),
        weight: form.weight ? Number(form.weight) : undefined,
        paymentMethod: form.paymentMethod,
        specialInstructions: form.specialInstructions.trim() || undefined,
      }
      const res = await api.post<{ ok: true; orderId: string; trackingUrl: string }>('/api/public/orders', payload)
      nav(`/order-confirmation?orderId=${encodeURIComponent(res.data.orderId)}`)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-800 px-4 py-6">
      <div className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          onClick={() => nav('/')}
          className="mb-4 inline-flex items-center gap-2 text-sm text-white/70 hover:text-white"
        >
          <ArrowLeft size={14} /> Back to home
        </button>

        <div className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600">
              <Package size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Request a delivery</h1>
            <p className="mt-2 text-sm text-slate-500">
              Fill in the pickup and delivery details below. Our team will review and assign a rider.
            </p>
          </div>

          <form onSubmit={submitOrder} className="space-y-8">
            <section className="rounded-2xl border border-slate-200 p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <MapPin size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Step 1</p>
                  <h2 className="text-lg font-semibold text-slate-900">Pickup (Sender)</h2>
                </div>
              </div>

              <div className="space-y-4">
                <Field label="Full name" required>
                  <Input value={form.senderName} onChange={onInputChange('senderName')} placeholder="Your full name" autoComplete="name" required />
                </Field>

                <Field label="Phone number" required>
                  <Input
                    value={form.senderPhone}
                    onChange={onInputChange('senderPhone')}
                    placeholder="+233201234567"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                  />
                </Field>

                <Field label="Pickup address" required>
                  <Textarea
                    value={form.senderAddress}
                    onChange={onInputChange('senderAddress')}
                    placeholder="Street, landmark, area"
                    rows={4}
                    required
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 p-5">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                  <Truck size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Step 2</p>
                  <h2 className="text-lg font-semibold text-slate-900">Delivery (Recipient)</h2>
                </div>
              </div>

              <div className="space-y-4">
                <Field label="Recipient name" required>
                  <Input value={form.recipientName} onChange={onInputChange('recipientName')} placeholder="Recipient full name" required />
                </Field>

                <Field label="Recipient phone" required>
                  <Input
                    value={form.recipientPhone}
                    onChange={onInputChange('recipientPhone')}
                    placeholder="+233201234567"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                  />
                </Field>

                <Field label="Delivery address" required>
                  <Textarea
                    value={form.recipientAddress}
                    onChange={onInputChange('recipientAddress')}
                    placeholder="Where should we deliver it?"
                    rows={4}
                    required
                  />
                </Field>

                <Field label="What are you sending?" required>
                  <Textarea
                    value={form.description}
                    onChange={onInputChange('description')}
                    placeholder="Documents, food package, small parcel..."
                    rows={3}
                    required
                  />
                </Field>

                <Field label="Weight in kg" hint="Optional">
                  <Input
                    value={form.weight}
                    onChange={onInputChange('weight')}
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    placeholder="e.g. 2.5"
                  />
                </Field>

                <Field label="Payment" required>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="cod"
                        checked={form.paymentMethod === 'cod'}
                        onChange={() => update('paymentMethod', 'cod')}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-slate-900">Cash on Delivery</p>
                        <p className="text-sm text-slate-500">Recipient pays when the rider arrives.</p>
                      </div>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="prepaid"
                        checked={form.paymentMethod === 'prepaid'}
                        onChange={() => update('paymentMethod', 'prepaid')}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-slate-900">Prepaid</p>
                        <p className="text-sm text-slate-500">Delivery cost is already settled.</p>
                      </div>
                    </label>
                  </div>
                </Field>

                <Field label="Special instructions" hint="Optional">
                  <Textarea
                    value={form.specialInstructions}
                    onChange={onInputChange('specialInstructions')}
                    placeholder="Gate code, landmarks, preferred call time..."
                    rows={3}
                  />
                </Field>
              </div>
            </section>

            <Button type="submit" size="lg" fullWidth loading={loading}>
              Submit order request
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
