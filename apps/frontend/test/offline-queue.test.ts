import 'fake-indexeddb/auto'
import { describe, expect, it, beforeEach } from 'vitest'
import { clearQueue, count, enqueue, listQueued } from '../src/offline/queue'

describe('offline queue', () => {
  beforeEach(async () => {
    await clearQueue()
  })

  it('stores and retrieves actions', async () => {
    await enqueue({ type: 'status', orderId: 'ord_1', payload: { status: 'delivered' } })
    const items = await listQueued()
    expect(items).toHaveLength(1)
    expect(items[0].orderId).toBe('ord_1')
    expect(items[0].clientActionId).toMatch(/^ca_/)
    expect(items[0].queuedAt).toBeTruthy()
  })

  it('counts queued actions', async () => {
    await enqueue({ type: 'status', orderId: 'a', payload: {} })
    await enqueue({ type: 'confirm', orderId: 'b', payload: {} })
    expect(await count()).toBe(2)
  })

  it('preserves provided clientActionId (idempotency)', async () => {
    const a = await enqueue({ type: 'status', orderId: 'x', payload: {}, clientActionId: 'fixed-id' })
    const b = await enqueue({ type: 'status', orderId: 'x', payload: {}, clientActionId: 'fixed-id' })
    expect(a.clientActionId).toBe('fixed-id')
    expect(b.clientActionId).toBe('fixed-id')
    expect(await count()).toBe(1) // same key, overwritten
  })
})
