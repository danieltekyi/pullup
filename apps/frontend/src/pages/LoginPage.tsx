import { useEffect } from 'react'
import { Package, ShieldCheck } from 'lucide-react'

/**
 * Admin login page — immediately redirects to Cloudflare Access.
 * If the user already has a valid Access session they pass through transparently.
 */
export default function LoginPage() {
  useEffect(() => {
    // Redirect to CF Access login for this domain — Access handles the OTP/GitHub flow.
    // After a successful login, Access redirects back to the returnPath.
    const returnPath = encodeURIComponent('/')
    window.location.replace(`/cdn-cgi/access/login/?redirect_url=${returnPath}`)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-brand-700">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 mb-4">
          <Package size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">PullUp Delivery</h1>
        <p className="text-sm text-slate-500 mt-2">Redirecting to sign in…</p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <ShieldCheck size={14} />
          Protected by Cloudflare Access
        </div>
      </div>
    </div>
  )
}
