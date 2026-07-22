import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Truck, Bike, ShieldCheck, MapPin, Clock, ArrowRight, Locate, Copy, CheckCircle2 } from 'lucide-react'
import { Button, Input } from '../../components/ui'

interface MyLoc { lat: number; lng: number; accuracy: number }

export default function CustomerLanding() {
  const nav = useNavigate()
  const [orderId, setOrderId] = useState('')
  const [myLoc, setMyLoc] = useState<MyLoc | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  function lookup(e: FormEvent) {
    e.preventDefault()
    const trimmed = orderId.trim()
    if (!trimmed) return
    nav(`/track?orderId=${encodeURIComponent(trimmed)}`)
  }

  function getLocation() {
    if (!navigator.geolocation) { alert('GPS not available on this device'); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setGpsLoading(false)
      },
      () => { setGpsLoading(false); alert('Could not get location. Please allow location access in your browser.') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function copyLink() {
    if (!myLoc) return
    const link = `https://maps.google.com/?q=${myLoc.lat.toFixed(6)},${myLoc.lng.toFixed(6)}`
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 3000) })
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-brand-600 flex items-center justify-center">
              <Package size={20} className="text-white" />
            </div>
            <span className="text-lg font-bold">PullUp</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600">
            <a href="#track" className="hover:text-brand-600">Track</a>
            <a href="#how" className="hover:text-brand-600">How it works</a>
            <a href="#faq" className="hover:text-brand-600">FAQ</a>
            <a href="mailto:support@aegisassetllc.com" className="hover:text-brand-600">Support</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold mb-4">
              Powered by PullUp Delivery
            </p>
            <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Track your delivery in <span className="text-brand-600">real time</span>
            </h1>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              Enter your order ID or use the tracking link we sent to see where your package is
              right now, updated live from the rider's phone.
            </p>

            <form onSubmit={lookup} id="track" className="mt-8 flex gap-2 max-w-md">
              <Input
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                placeholder="Order ID e.g. ord_xxx"
                className="text-base"
              />
              <Button type="submit" size="lg" icon={<ArrowRight size={16} />}>
                Track
              </Button>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              Received a tracking email? Just tap the link — no ID needed.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex-1 border-t border-slate-200" />
              <span className="text-sm text-slate-400">or</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>
            <div className="mt-4">
              <Button variant="secondary" size="lg" fullWidth onClick={() => nav('/order')}>
                Place a Delivery Order
              </Button>
            </div>

            {/* GPS Location section */}
            <div className="mt-6 border border-slate-200 rounded-2xl p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Locate size={16} className="text-brand-600" />
                Share your exact location
              </p>
              {!myLoc ? (
                <button
                  onClick={getLocation}
                  disabled={gpsLoading}
                  className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-60 transition-colors"
                >
                  {gpsLoading
                    ? <><span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Getting location…</>
                    : <><Locate size={16} /> Get my GPS location</>
                  }
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      <p className="text-sm font-semibold text-emerald-700">Location captured!</p>
                    </div>
                    <p className="text-xs font-mono text-slate-600">
                      {myLoc.lat.toFixed(6)}, {myLoc.lng.toFixed(6)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Accuracy: ±{Math.round(myLoc.accuracy)} metres</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={copyLink}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                    >
                      {copied ? <><CheckCircle2 size={14} /> Copied!</> : <><Copy size={14} /> Copy location link</>}
                    </button>
                    <a
                      href={`https://maps.google.com/?q=${myLoc.lat.toFixed(6)},${myLoc.lng.toFixed(6)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors"
                    >
                      <MapPin size={14} /> Open map
                    </a>
                  </div>
                  <button onClick={getLocation} className="w-full text-xs text-slate-400 hover:text-slate-600 text-center py-1">
                    Refresh location
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2 text-center">
                Send the copied link to your rider via WhatsApp or SMS
              </p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-brand-100 via-blue-100 to-purple-100 rounded-3xl blur-2xl opacity-70" />
            <div className="relative bg-white border border-slate-200 rounded-2xl shadow-xl p-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Bike size={20} className="text-emerald-700" />
                </div>
                <div>
                  <p className="font-semibold">On the way</p>
                  <p className="text-xs text-slate-500">ETA ~ 12 minutes</p>
                </div>
              </div>
              <div className="pt-4 space-y-3 text-sm">
                <Row icon={MapPin} label="Destination" value="Ridge, Accra" />
                <Row icon={Truck} label="Bike" value="GT-8412-24" />
                <Row icon={Clock} label="Picked up at" value="2:14 PM" />
                <Row icon={ShieldCheck} label="Verified rider" value="Kwame A." />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-slate-50 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center">How it works</h2>
          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {[
              { icon: Package, title: 'Order placed', body: 'Your merchant creates the delivery. We pick it up.' },
              { icon: Bike, title: 'Rider dispatched', body: 'Nearest available rider grabs it and heads your way.' },
              { icon: ShieldCheck, title: 'Signed for', body: 'You sign on the rider\'s phone; we email you a receipt.' },
            ].map(step => (
              <div key={step.title} className="bg-white rounded-xl p-6 shadow-card">
                <div className="h-10 w-10 rounded-lg bg-brand-600 text-white flex items-center justify-center mb-3">
                  <step.icon size={20} />
                </div>
                <h3 className="font-bold text-slate-900">{step.title}</h3>
                <p className="text-sm text-slate-600 mt-1">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center">FAQ</h2>
        <div className="mt-8 space-y-4">
          {[
            {
              q: 'How long is the tracking link valid?',
              a: 'Tracking links expire when the delivery is confirmed complete — usually within an hour of drop-off.',
            },
            {
              q: 'The rider called and I missed it — what happens?',
              a: 'If the rider can\'t reach you, the delivery is marked "recipient not home" and you\'ll be contacted to reschedule.',
            },
            {
              q: 'Can I change the delivery address?',
              a: 'Only your merchant can change the destination. Contact the store where you placed the order.',
            },
            {
              q: 'I paid cash on delivery — is that recorded?',
              a: 'Yes. The rider marks it collected in the app, and the amount is reconciled the same day.',
            },
          ].map(item => (
            <details
              key={item.q}
              className="group border border-slate-200 rounded-lg p-4 open:bg-slate-50 transition-colors"
            >
              <summary className="cursor-pointer font-semibold text-slate-900 flex items-center justify-between list-none">
                {item.q}
                <span className="text-slate-400 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-8 text-center text-sm text-slate-500">
          <p>© {new Date().getFullYear()} Aegis Asset Management · Powered by PullUp</p>
          <p className="mt-1">
            <a href="mailto:support@aegisassetllc.com" className="hover:text-brand-600">
              support@aegisassetllc.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}

function Row({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-500">
        <Icon size={14} />
        {label}
      </span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}
