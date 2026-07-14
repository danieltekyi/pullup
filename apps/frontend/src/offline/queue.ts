import { openDB, type IDBPDatabase } from 'idb'
import type { SyncAction, SyncResult } from '@pullup/shared'

const DB_NAME = 'pullup-offline'
const STORE = 'action-queue'
const VERSION = 2

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'clientActionId' })
        }
        if (oldVersion < 2) {
          // Migration hook — no-op for now.
        }
      },
    })
  }
  return dbPromise
}

export async function enqueue(action: Omit<SyncAction, 'clientActionId' | 'queuedAt'> & { clientActionId?: string }): Promise<SyncAction> {
  const db = await getDb()
  const item: SyncAction = {
    ...(action as SyncAction),
    clientActionId:
      action.clientActionId ?? `ca_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    queuedAt: new Date().toISOString(),
  }
  await db.put(STORE, item)
  return item
}

export async function listQueued(): Promise<SyncAction[]> {
  const db = await getDb()
  return (await db.getAll(STORE)) as SyncAction[]
}

export async function dequeue(clientActionId: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE, clientActionId)
}

export async function clearQueue(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE)
}

export async function count(): Promise<number> {
  const db = await getDb()
  return db.count(STORE)
}

export type { SyncResult }
