import { useState, type FormEvent } from 'react'
import { Building2 } from 'lucide-react'
import { Button, Field, Input, toast } from '../../components/ui'
import { api, apiErrorMessage } from '../../services/api'

interface Props {
  onSuccess: (token: string, partner: { id: string; name: string; email: string }) => void
}

export default function PartnerLogin({ onSuccess }: Props) {
  const [phase, setPhase] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function requestCode(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      const res = await api.post<{ ok: boolean; message: string; _devCode?: string }>(
        '/api/partner-auth/request',
        { identifier: email.trim() },
      )
      setPhase('code')
      if (res.data._devCode) {
        toast.warning(`Email not configured. Your code is: ${res.data._devCode}`)
        setCode(res.data._devCode)
      } else {
        toast.info('Code sent to your email — check inbox and spam')
      }
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
      const res = await api.post<{ token: string; partner: { id: string; name: string; email: string } }>(
        '/api/partner-auth/verify',
        { identifier: email.trim(), code: code.trim() },
      )
      localStorage.setItem('partner_session', res.data.token)
      onSuccess(res.data.token, res.data.partner)
    } catch (err) {
      toast.error(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-slate-900 to-slate-800">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600 mb-4">
              <Building2 size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">PullUp Partner</h1>
            <p className="text-sm text-slate-500 mt-1">
              {phase === 'email' ? 'Enter your business email to sign in' : `Enter the code sent to ${email}`}
            </p>
          </div>

          {phase === 'email' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <Field label="Business email" required>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@business.com" type="email" autoFocus />
              </Field>
              <Button type="submit" fullWidth size="lg" loading={loading}>Send code</Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-4">
              <Field label="6-digit code" required hint="Check your email">
                <Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" type="text" inputMode="numeric" maxLength={6} autoFocus />
              </Field>
              <Button type="submit" fullWidth size="lg" loading={loading} disabled={code.length !== 6}>Sign in</Button>
              <button type="button" onClick={() => { setPhase('email'); setCode('') }} className="w-full text-sm text-slate-400 hover:text-slate-600 text-center">Use a different email</button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-white/50 mt-4">© PullUp Delivery Management</p>
      </div>
    </div>
  )
}
