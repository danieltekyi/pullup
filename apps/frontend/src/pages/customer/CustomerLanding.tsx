import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Truck, Bike, ShieldCheck, MapPin, Clock, ArrowRight } from 'lucide-react'
import { Button, Input } from '../../components/ui'

export default function CustomerLanding() {
  const nav = useNavigate()
  const [orderId, setOrderId] = useState('')

  function lookup(e: FormEvent) {
    e.preventDefault()
    const trimmed = orderId.trim()
    if (!trimmed) return
    // Lookup by order ID goes to a search flow — if a signed tracker token
    // was emailed, the direct /track?token=... link opens that.
    nav(`/lookup?orderId=${encodeURIComponent(trimmed)}`)
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
