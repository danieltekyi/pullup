import { useSearchParams } from 'react-router-dom'
import { Package, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui'

export default function CustomerLookup() {
  const [params] = useSearchParams()
  const orderId = params.get('orderId')

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-brand-600 mb-4"
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <Card>
          <div className="text-center py-4">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-brand-100 text-brand-600 items-center justify-center mb-4">
              <Package size={26} />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Order lookup</h1>
            <p className="text-sm text-slate-500 mt-2">
              {orderId ? (
                <>
                  Looking for order <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">{orderId}</code>.
                </>
              ) : (
                'No order ID supplied.'
              )}
            </p>
            <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-left">
              <p className="text-sm text-amber-900">
                Order-ID lookup by unauthenticated customers isn't enabled yet — we only send
                signed tracking links to prevent enumeration attacks.
              </p>
              <p className="text-sm text-amber-900 mt-2">
                Check your <strong>email or SMS</strong> for the direct tracking link from your merchant,
                or contact <a href="mailto:support@aegisassetllc.com" className="underline">support@aegisassetllc.com</a>.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
