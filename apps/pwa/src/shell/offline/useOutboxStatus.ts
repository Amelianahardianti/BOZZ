import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

export interface OutboxStatusSummary {
  /** Masih diproses (nunggu giliran atau lagi dikirim). */
  pendingCount: number
  /** Ditolak server (4xx) -- gak di-retry otomatis, perlu ditangani manual. */
  failedCount: number
}

/**
 * Reaktif ke perubahan IndexedDB (dexie-react-hooks) -- dipakai buat
 * badge "3 transaksi belum tersinkron" dll di shell/AppShell nanti.
 */
export function useOutboxStatus(): OutboxStatusSummary {
  const summary = useLiveQuery(async () => {
    const [pendingCount, failedCount] = await Promise.all([
      db.outboxTransactions.where('status').anyOf('pending', 'syncing').count(),
      db.outboxTransactions.where('status').equals('failed').count(),
    ])
    return { pendingCount, failedCount }
  }, [])

  return summary ?? { pendingCount: 0, failedCount: 0 }
}
