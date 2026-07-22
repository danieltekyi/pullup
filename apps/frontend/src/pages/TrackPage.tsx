import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bike, CheckCircle2, Clock, Copy, Locate, MapPin, Package, XCircle, RefreshCw } from 'lucide-react'
import { api, apiErrorMessage } from '../services/api'

interface TrackData {
  orderId: string
  orderStatus: string
  bikeId?: string | null
  customerName?: string
  destination?: string
  pickupLat?: number
  pickupLng?: number
  dropoffLat?: number
  dropoffLng?: number
  etaMinutes?: number
  etaText?: string
}

interface RiderLoc {
  available: boolean
  lat?: number
  lng?: number
  updatedAt?: string
}

interface MyLoc {
  lat: number
  lng: number
  accuracy: number
}

const ACTIVE = ['picked_up', 'in_transit']
const DONE = ['delivered', 'confirmed']

declare global {
  interface Window { google?: any; __mapsLoaded?: boolean }
}

export default function TrackPage() {
  const [sp] = useSearchParams()
  const token = sp.get('token')
  const orderId = sp.get('orderId')
  const [phase, setPhase] = useState<'loading' | 'valid' | 'done' | 'error'>('loading')
  const [data, setData] = useState<TrackData | null>(null)
  const [riderLoc, setRiderLoc] = useState<RiderLoc | null>(null)
  const [mapsKey, setMapsKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [myLoc, setMyLoc] = useState<MyLoc | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsCopied, setGpsCopied] = useState(false)
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapInst = useRef<any>(null)
  const riderMarker = useRef<any>(null)
  const myMarker = useRef<any>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initial load
  useEffect(() => {
    if (!token && !orderId) { setPhase('error'); setError('No tracking details provided.'); return }
    Promise.all([
      api.post('/api/tracker/validate', token ? { token } : { orderId }),
      api.get<{ mapsApiKey: string | null }>('/api/public/config'),
    ]).then(([t, c]) => {
      setData(t.data)
      setMapsKey(c.data.mapsApiKey)
      setPhase(DONE.includes(t.data.orderStatus) ? 'done' : 'valid')
    }).catch(err => {
      if (err.response?.status === 410) setPhase('done')
      else { setPhase('error'); setError(apiErrorMessage(err)) }
    })
  }, [orderId, token])

  // Refresh order status every 30s
  useEffect(() => {
    if (phase !== 'valid' || !data) return
    const t = setInterval(() => {
      api.post('/api/tracker/validate', token ? { token } : { orderId: data.orderId })
        .then(r => {
          setData(r.data)
          if (DONE.includes(r.data.orderStatus)) { setPhase('done'); clearInterval(t) }
        }).catch(() => {})
    }, 30_000)
    return () => clearInterval(t)
  }, [phase, data?.orderId])

  // Poll rider location every 15s when active
  useEffect(() => {
    if (!data || !ACTIVE.includes(data.orderStatus)) return
    const fetch = () => {
      api.get<RiderLoc>(`/api/rider-location/${data.orderId}`)
        .then(r => setRiderLoc(r.data)).catch(() => {})
    }
    fetch()
    pollTimer.current = setInterval(fetch, 15_000)
    return () => { if (pollTimer.current) clearInterval(pollTimer.current) }
  }, [data?.orderId, data?.orderStatus])

  // Init Google Map
  useEffect(() => {
    if (!mapsKey || !data || !ACTIVE.includes(data.orderStatus)) return
    if (!data.dropoffLat || !data.dropoffLng || !mapDiv.current) return

    function buildMap() {
      if (!mapDiv.current || mapInst.current) return
      const center = { lat: data!.dropoffLat!, lng: data!.dropoffLng! }
      const map = new window.google.maps.Map(mapDiv.current, {
        center, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      })
      mapInst.current = map
      new window.google.maps.Marker({ position: center, map, title: 'Delivery destination',
        icon: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png' })
      if (data!.pickupLat && data!.pickupLng)
        new window.google.maps.Marker({ position: { lat: data!.pickupLat!, lng: data!.pickupLng! }, map, title: 'Pickup location',
          icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' })
    }

    if (window.google?.maps) { buildMap(); return }
    if (!window.__mapsLoaded) {
      window.__mapsLoaded = true
      const s = document.createElement('script')
      s.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}`
      s.async = true; s.onload = buildMap
      document.head.appendChild(s)
    }
  }, [mapsKey, data?.orderId, data?.orderStatus])

  // Move rider marker
  useEffect(() => {
    if (!mapInst.current || !riderLoc?.available || !riderLoc.lat || !riderLoc.lng) return
    const pos = { lat: riderLoc.lat, lng: riderLoc.lng }
    if (riderMarker.current) riderMarker.current.setPosition(pos)
    else riderMarker.current = new window.google.maps.Marker({
      position: pos, map: mapInst.current, title: 'Your rider',
      icon: { url: 'https://maps.google.com/mapfiles/ms/icons/motorcycling.png', scaledSize: new window.google.maps.Size(40, 40) },
      zIndex: 999,
    })
    mapInst.current.panTo(pos)
  }, [riderLoc])

  // Show my location marker on map
  useEffect(() => {
    if (!mapInst.current || !myLoc) return
    const pos = { lat: myLoc.lat, lng: myLoc.lng }
    if (myMarker.current) myMarker.current.setPosition(pos)
    else myMarker.current = new window.google.maps.Marker({
      position: pos, map: mapInst.current, title: 'Your location',
      icon: { url: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png' },
      zIndex: 998,
    })
    // Fit map to show both rider and customer
    const bounds = new window.google.maps.LatLngBounds()
    bounds.extend(pos)
    if (riderLoc?.lat && riderLoc?.lng) bounds.extend({ lat: riderLoc.lat, lng: riderLoc.lng })
    mapInst.current.fitBounds(bounds, 80)
  }, [myLoc])

  function shareMyLocation() {
    if (!navigator.geolocation) {
      alert('GPS not available on this device')
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setGpsLoading(false)
      },
      () => {
        setGpsLoading(false)
        alert('Could not get your location. Please allow location access.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function copyCoords() {
    if (!myLoc) return
    const text = `https://maps.google.com/?q=${myLoc.lat.toFixed(6)},${myLoc.lng.toFixed(6)}`
    navigator.clipboard.writeText(text).then(() => {
      setGpsCopied(true)
      setTimeout(() => setGpsCopied(false), 3000)
    })
  }

  const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-brand-50">
      {/* Map â€” only when rider is active */}
      {phase === 'valid' && data && ACTIVE.includes(data.orderStatus) && (
        <div ref={mapDiv} className="w-full h-64 md:h-80 bg-slate-200" />
      )}

      <div className="flex justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 text-center">

          {phase === 'loading' && (
            <div className="py-10 flex flex-col items-center gap-3">
              <RefreshCw size={24} className="animate-spin text-brand-600" />
              <p className="text-slate-500 text-sm">Loading tracking infoâ€¦</p>
            </div>
          )}

          {phase === 'done' && (
            <>
              <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={44} />
              <h1 className="text-xl font-bold text-emerald-700">Delivery complete!</h1>
              <p className="text-sm text-slate-500 mt-1">Thank you for using PullUp Delivery.</p>
            </>
          )}

          {phase === 'error' && (
            <>
              <XCircle className="mx-auto text-red-500 mb-3" size={44} />
              <h1 className="text-xl font-bold text-red-700">Link unavailable</h1>
              <p className="text-sm text-slate-500 mt-1">{error}</p>
            </>
          )}

          {phase === 'valid' && data && (
            <>
              <div className="inline-flex h-14 w-14 rounded-2xl bg-brand-600 text-white items-center justify-center mb-4">
                <Package size={28} />
              </div>

              <h1 className="text-xl font-bold text-slate-900 mb-1">
                {ACTIVE.includes(data.orderStatus) ? 'ðŸš´ Rider is on the way!' : 'Order received'}
              </h1>
              <p className="text-sm text-slate-500 mb-5">
                {ACTIVE.includes(data.orderStatus) ? 'Map updates live every 15 seconds' : 'Your rider will be assigned shortly'}
              </p>

              <div className="bg-slate-50 rounded-xl p-4 text-left space-y-3 mb-4">
                <InfoRow icon={Package} label="Order" value={data.orderId.slice(-12)} />
                <InfoRow icon={MapPin} label="Delivering to" value={data.destination ?? 'â€”'} />
                <InfoRow icon={Bike} label="Status" value={statusLabel(data.orderStatus)} highlight />

                {/* ETA â€” only when picked up / in transit */}
                {ACTIVE.includes(data.orderStatus) && data.etaText && (
                  <InfoRow icon={Clock} label="Estimated arrival" value={data.etaText} highlight />
                )}

                {ACTIVE.includes(data.orderStatus) && riderLoc?.available && riderLoc.updatedAt && (
                  <InfoRow icon={Clock} label="Location updated" value={new Date(riderLoc.updatedAt).toLocaleTimeString()} />
                )}
              </div>

              {/* Share my location section */}
              <div className="border border-slate-200 rounded-xl p-4 text-left mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Locate size={15} className="text-brand-600" />
                  Share your location with the rider
                </p>
                {!myLoc ? (
                  <button
                    onClick={shareMyLocation}
                    disabled={gpsLoading}
                    className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-60"
                  >
                    {gpsLoading ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <Locate size={15} />
                    )}
                    {gpsLoading ? 'Getting locationâ€¦' : 'Get my GPS location'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-emerald-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-emerald-600 font-semibold">ðŸ“ Location captured</p>
                      <p className="text-xs text-slate-600 font-mono mt-0.5">
                        {myLoc.lat.toFixed(6)}, {myLoc.lng.toFixed(6)}
                      </p>
                      {myLoc.accuracy && (
                        <p className="text-xs text-slate-400 mt-0.5">Accuracy: Â±{Math.round(myLoc.accuracy)} m</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={copyCoords}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2 rounded-lg"
                      >
                        <Copy size={12} />
                        {gpsCopied ? 'Copied! âœ“' : 'Copy Google Maps link'}
                      </button>
                      <button
                        onClick={shareMyLocation}
                        className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2 px-3 rounded-lg"
                        title="Refresh location"
                      >
                        <RefreshCw size={12} />
                      </button>
                    </div>
                    <a
                      href={`https://maps.google.com/?q=${myLoc.lat.toFixed(6)},${myLoc.lng.toFixed(6)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-xs text-brand-600 hover:underline"
                    >
                      Open in Google Maps â†’
                    </a>
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-2">Your location is only visible to you â€” share it with the rider if needed.</p>
              </div>

              {ACTIVE.includes(data.orderStatus) && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  <span className="text-xs text-emerald-600 font-medium">Live tracking active</span>
                </div>
              )}

              {!ACTIVE.includes(data.orderStatus) && (
                <p className="text-xs text-slate-400 mt-2">
                  The map and ETA will appear once your rider picks up the package.
                </p>
              )}
            </>
          )}

          <p className="text-[10px] text-slate-400 mt-6">Powered by PullUp Delivery Management</p>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, highlight }: { icon: typeof Package; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-slate-500"><Icon size={13} />{label}</span>
      <span className={highlight ? 'font-bold text-brand-600' : 'font-semibold text-slate-900'}>{value}</span>
    </div>
  )
}
