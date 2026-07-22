import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Package, CheckCircle2, XCircle } from 'lucide-react'
import { api, apiErrorMessage } from '../services/api'

export default function TrackPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const orderId = params.get('orderId')
  const [state, setState] = useState<'loading' | 'valid' | 'expired' | 'error'>('loading')
  const [data, setData] = useState<{ orderId: string; bikeId?: string; orderStatus?: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token && !orderId) {
      setState('error')
      setError('No tracking details provided.')
      return
    }
    api.post('/api/tracker/validate', token ? { token } : { orderId })
      .then(res => { setData(res.data); setState('valid') })
      .catch(err => {
        const code = err.response?.status
        if (code === 410) setState('expired')
        else { setState('error'); setError(apiErrorMessage(err)) }
      })
  }, [orderId, token])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-brand-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="inline-flex h-14 w-14 rounded-2xl bg-brand-600 text-white items-center justify-center mb-4">
          <Package size={28} />
        </div>

        {state === 'loading' && <p className="text-slate-500">Loading tracking info…</p>}

        {state === 'valid' && data && (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-1">Your delivery is on the way</h1>
            <p className="text-sm text-slate-500 mb-6">Live status for your order</p>
            <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2">
              <Row label="Order ID" value={data.orderId} />
              {data.bikeId && <Row label="Bike / Device" value={data.bikeId} />}
              <Row label="Status" value={(data.orderStatus || 'in transit').replace(/_/g, ' ')} />
            </div>
          </>
        )}

        {state === 'expired' && (
          <>
            <CheckCircle2 className="mx-auto text-emerald-600 mb-2" size={28} />
            <h1 className="text-xl font-bold text-emerald-700">Delivery complete</h1>
            <p className="text-sm text-slate-500 mt-1">Thanks for using PullUp.</p>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="mx-auto text-red-600 mb-2" size={28} />
            <h1 className="text-xl font-bold text-red-700">Link unavailable</h1>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
          </>
        )}

        <p className="text-[10px] text-slate-400 mt-6">Powered by PullUp Delivery Management</p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}
