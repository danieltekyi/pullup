import { useEffect, useState } from 'react'
import { Card, Button, toast } from '../components/ui'
import { subscribeToPush, unsubscribeFromPush } from '../services/push'
import { Bell, BellOff } from 'lucide-react'

export default function SettingsPage() {
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushEnabled(false)
      return
    }
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => setPushEnabled(!!sub)),
    )
  }, [])

  async function togglePush() {
    if (pushEnabled) {
      await unsubscribeFromPush()
      setPushEnabled(false)
      toast.success('Push notifications turned off')
    } else {
      const ok = await subscribeToPush()
      if (ok) {
        setPushEnabled(true)
        toast.success('Push notifications enabled')
      } else {
        toast.error('Could not enable push notifications')
      }
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card title="Push notifications">
        <p className="text-sm text-slate-500 mb-3">
          Get alerts on this device when new orders are assigned or status changes happen.
        </p>
        <Button
          variant={pushEnabled ? 'secondary' : 'primary'}
          icon={pushEnabled ? <BellOff size={16} /> : <Bell size={16} />}
          onClick={togglePush}
          disabled={pushEnabled === null}
        >
          {pushEnabled === null ? 'Loading…' : pushEnabled ? 'Turn off' : 'Enable push notifications'}
        </Button>
      </Card>

      <Card title="About">
        <p className="text-sm text-slate-500">
          PullUp Delivery v2.0 — Premium build. Report issues at{' '}
          <a href="https://github.com/Stekyi/pullup/issues" className="text-brand-600 underline">
            github.com/Stekyi/pullup
          </a>
          .
        </p>
      </Card>
    </div>
  )
}
