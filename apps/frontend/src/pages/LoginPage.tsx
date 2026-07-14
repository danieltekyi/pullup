import { Package, ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui'

/**
 * Under Cloudflare Access, users never see a password prompt on our side —
 * Access shows its own login page and redirects here after success. This page
 * only appears if the browser somehow bypasses Access (unusual) or if a user
 * navigates to /login directly. In both cases, hitting any protected route
 * triggers the Access flow.
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-brand-700">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 mb-4">
          <Package size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">PullUp Delivery</h1>
        <p className="text-sm text-slate-500 mt-2">Sign in with your Aegis account</p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck size={14} />
          Protected by Cloudflare Access
        </div>
        <div className="mt-8">
          <Button size="lg" fullWidth onClick={() => (window.location.href = '/')}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
