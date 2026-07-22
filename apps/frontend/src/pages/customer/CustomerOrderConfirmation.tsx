import { CheckCircle2, Copy, Package } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, toast } from '../../components/ui'

export default function CustomerOrderConfirmation() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const orderId = params.get('orderId')?.trim() || '—'

  async function copyOrderId() {
    try {
      await navigator.clipboard.writeText(orderId)
      toast.success('Order ID copied')
    } catch {
      toast.error('Could not copy order ID')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-brand-50 px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">
        <div className="w-full rounded-3xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={42} />
          </div>

          <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Package size={24} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Order Received!</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Our team will review your request and assign a rider. You&apos;ll receive updates via phone.
          </p>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Order ID</p>
            <p className="mt-2 break-all font-mono text-2xl font-bold text-slate-900">{orderId}</p>
            <button
              type="button"
              onClick={copyOrderId}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Copy size={16} />
              Copy to clipboard
            </button>
          </div>

          <div className="mt-8 space-y-3">
            <Button size="lg" fullWidth onClick={() => nav(`/track?orderId=${encodeURIComponent(orderId)}`)}>
              Track your order
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={() => nav('/order')}>
              Place another order
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
