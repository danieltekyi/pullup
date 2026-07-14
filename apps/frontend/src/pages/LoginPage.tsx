import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button, Field, Input } from '../components/ui'

export default function LoginPage() {
  const { login, confirmNewPassword } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'login' | 'new-password'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result?.requiresNewPassword) setPhase('new-password')
      else navigate('/')
    } catch (err) {
      setError((err as Error).message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleNewPassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPwd) return setError('Passwords do not match')
    if (newPassword.length < 12) return setError('Password must be at least 12 characters')
    setError('')
    setLoading(true)
    try {
      await confirmNewPassword(newPassword)
      navigate('/')
    } catch (err) {
      setError((err as Error).message || 'Failed to set password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-brand-700">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 mb-4">
              <Package size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">PullUp Delivery</h1>
            <p className="text-sm text-slate-500 mt-1">
              {phase === 'login' ? 'Sign in to continue' : 'Set a new password'}
            </p>
          </div>

          {phase === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <Field label="Email" required>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Password" required>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </Field>
              {error && <div className="p-3 rounded-lg bg-red-50 text-sm text-red-700">{error}</div>}
              <Button type="submit" fullWidth size="lg" loading={loading}>
                Sign In
              </Button>
            </form>
          ) : (
            <form onSubmit={handleNewPassword} className="space-y-4">
              <p className="text-sm text-slate-600">Your account needs a new password before continuing.</p>
              <Field label="New Password" required>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min 12 characters"
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label="Confirm Password" required>
                <Input
                  type="password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </Field>
              {error && <div className="p-3 rounded-lg bg-red-50 text-sm text-red-700">{error}</div>}
              <Button type="submit" fullWidth size="lg" loading={loading}>
                Set Password & Continue
              </Button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-white/70 mt-4">© PullUp Delivery Management</p>
      </div>
    </div>
  )
}
