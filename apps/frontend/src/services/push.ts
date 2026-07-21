import { api } from '../services/api'

const VAPID_STORAGE = 'pullup-vapid-key'

async function fetchVapidPublicKey(): Promise<string | null> {
  const cached = localStorage.getItem(VAPID_STORAGE)
  if (cached) return cached
  try {
    const res = await api.get<{ publicKey: string }>('/api/push/vapid')
    localStorage.setItem(VAPID_STORAGE, res.data.publicKey)
    return res.data.publicKey
  } catch {
    return null
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const publicKey = await fetchVapidPublicKey()
  if (!publicKey) return false

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return true

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: publicKey,
  })
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } }
  if (!json.endpoint || !json.keys) return false
  await api.post('/api/push/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
  })
  return true
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint })
    await sub.unsubscribe()
  }
}
