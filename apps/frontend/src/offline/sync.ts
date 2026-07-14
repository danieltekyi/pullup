import { api } from '../services/api'
import { count, dequeue, listQueued } from './queue'
import type { SyncResult } from '@pullup/shared'
import { toast } from '../components/ui'

let listenerAttached = false
let currentlySyncing = false

export async function syncQueue(): Promise<{ applied: number; failed: number }> {
  if (currentlySyncing) return { applied: 0, failed: 0 }
  currentlySyncing = true
  try {
    const actions = await listQueued()
    if (!actions.length) return { applied: 0, failed: 0 }
    const res = await api.post<{ results: SyncResult[]; applied: number }>('/api/sync', { actions })
    // Dequeue only the truly successful ones (fixes v1 bug that lost actions).
    for (const r of res.data.results) {
      if (r.ok) await dequeue(r.clientActionId)
    }
    const applied = res.data.results.filter(r => r.ok).length
    return { applied, failed: res.data.results.length - applied }
  } catch {
    return { applied: 0, failed: await count() }
  } finally {
    currentlySyncing = false
  }
}

export function startOnlineListener() {
  if (listenerAttached) return
  listenerAttached = true
  window.addEventListener('online', async () => {
    const { applied, failed } = await syncQueue()
    if (applied > 0) toast.success(`Synced ${applied} offline action${applied > 1 ? 's' : ''}`)
    if (failed > 0) toast.warning(`${failed} action${failed > 1 ? 's' : ''} still pending sync`)
  })
  // Retry every 60s in case 'online' event was missed.
  setInterval(async () => {
    if (navigator.onLine) {
      const c = await count()
      if (c > 0) await syncQueue()
    }
  }, 60_000)
}

export async function pendingCount(): Promise<number> {
  return count()
}
