import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Locate, Package, XCircle } from 'lucide-react'
import { api } from '../../services/api'

export default function LocatePage() {
  const [sp] = useSearchParams()
  const token = sp.get('t')
  const [phase, setPhase] = useState<'ready' | 'loading' | 'success' | 'expired' | 'error'>('ready')
  const [address, setAddress] = useState('')
  const [cost, setCost] = useState<number | null>(null)

  useEffect(() => {
    if (!token) setPhase('error')
  }, [token])

  function share() {
    if (!navigator.geolocation) { setPhase('error'); return }
    setPhase('loading')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const res = await api.post<{ ok: boolean; address: string; cost?: number }>(
            `/api/public/location-confirm/${token}`,
            { lat: pos.coords.latitude, lng: pos.coords.longitude }
          )
          setAddress(res.data.address)
          setCost(res.data.cost ?? null)
          setPhase('success')
        } catch (err: any) {
          if (err?.response?.status === 410) setPhase('expired')
          else setPhase('error')
        }
      },
      () => setPhase('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-800">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 mb-5">
            <Package size={28} className="text-white" />
          </div>

          {phase === 'ready' && (
            <>
              <h1 className="text-xl font-bold text-slate-900">Delivery on the way!</h1>
              <p className="text-sm text-slate-500 mt-2 mb-6 leading-relaxed">
                PullUp Delivery is bringing a package to you. Tap below to share your exact location so our rider can find you easily.
              </p>
              <button
                onClick={share}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors"
              >
                <Locate size={16} />
                Share my location
              </button>
              <p className="text-xs text-slate-400 mt-3">Your location will only be shared with your delivery rider.</p>
            </>
          )}

          {phase === 'loading' && (
            <>
              <div className="h-12 w-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Getting your location…</p>
              <p className="text-xs text-slate-400 mt-1">Please allow location access when prompted</p>
            </>
          )}

          {phase === 'success' && (
            <>
              <CheckCircle2 className="mx-auto text-emerald-600 mb-4" size={44} />
              <h1 className="text-xl font-bold text-emerald-700">Location received!</h1>
              <p className="text-sm text-slate-500 mt-2">Your delivery is being arranged. The rider will be with you shortly.</p>
              {address && (
                <div className="mt-4 bg-slate-50 rounded-xl p-3 text-sm text-slate-600 text-left">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Delivery address</p>
                  <p>{address}</p>
                </div>
              )}
              {cost && (
                <div className="mt-3 bg-emerald-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Delivery cost</p>
                  <p className="text-2xl font-bold text-emerald-700">GHS {cost.toFixed(2)}</p>
                </div>
              )}
            </>
          )}

          {phase === 'expired' && (
            <>
              <XCircle className="mx-auto text-amber-500 mb-4" size={44} />
              <h1 className="text-xl font-bold text-amber-700">Link expired</h1>
              <p className="text-sm text-slate-500 mt-2">This location link has already been used or has expired. Contact the sender for a new link.</p>
            </>
          )}

          {phase === 'error' && (
            <>
              <XCircle className="mx-auto text-red-500 mb-4" size={44} />
              <h1 className="text-xl font-bold text-red-700">Something went wrong</h1>
              <p className="text-sm text-slate-500 mt-2">Could not get your location. Please make sure location access is enabled and try again.</p>
              {phase === 'error' && (
                <button onClick={() => setPhase('ready')} className="mt-4 text-sm text-brand-600 hover:underline">
                  Try again
                </button>
              )}
            </>
          )}
        </div>
        <p className="text-center text-xs text-white/40 mt-4">© PullUp Delivery Management</p>
      </div>
    </div>
  )
}
