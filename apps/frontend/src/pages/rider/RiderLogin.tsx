import { useState, type FormEvent } from 'react'
import { Package } from 'lucide-react'
import { Button, Field, Input, toast } from '../../components/ui'
import { api, apiErrorMessage } from '../../services/api'

interface Props {
  onSuccess: (token: string, rider: { id: string; name: string; role: string; riderId?: string; branchId?: string }) => void
}

export default function RiderLogin({ onSuccess }: Props) {
  const [phase, setPhase] = useState<'identifier' | 'code'>('identifier')
  const [identifier, setIdentifier] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function requestCode(e: FormEvent) {
    e.preventDefault()
    if (!identifier.trim()) return
    setLoading(true)
    try {
      await api.post('/api/rider-auth/request', { identifier: identifier.trim() })
      setPhase('code')
      toast.info('Code sent — check your phone or email (including spam)')
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    try {
      const res = await api.post<{ token: string; rider: { id: string; name: string; role: string; riderId?: string; branchId?: string } }>(
        '/api/rider-auth/verify',
        { identifier: identifier.trim(), code: code.trim() },
      )
      localStorage.setItem('rider_session', res.data.token)
      onSuccess(res.data.token, res.data.rider)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-800">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 mb-4">
              <Package size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">PullUp Rider</h1>
            <p className="text-sm text-slate-500 mt-1">
              {phase === 'identifier' ? 'Enter your phone number or email' : `Enter the code sent to ${identifier}`}
            </p>
          </div>

          {phase === 'identifier' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <Field label="Phone or email" required>
                <Input
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="+233201234567 or name@email.com"
                  type="text"
                  autoComplete="tel email"
                  autoFocus
                />
              </Field>
              <Button type="submit" fullWidth size="lg" loading={loading}>
                Send code
              </Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-4">
              <Field label="6-digit code" required hint="Check SMS or email — may take 1-2 min">
                <Input
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                />
              </Field>
              <Button type="submit" fullWidth size="lg" loading={loading} disabled={code.length !== 6}>
                Sign in
              </Button>
              <button
                type="button"
                onClick={() => { setPhase('identifier'); setCode('') }}
                className="w-full text-sm text-slate-400 hover:text-slate-600 text-center"
              >
                Use a different number or email
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-white/50 mt-4">© PullUp Delivery Management</p>
      </div>
    </div>
  )
}
