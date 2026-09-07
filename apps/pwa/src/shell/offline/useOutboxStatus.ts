import { useLiveQuery } from 'dexie-react-hooks'
import { db, type OutboxStatus } from './db'

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

/**
 * 'checking' cuma sesaat (Dexie belum resolve pertama kali) -- BEDA
 * dari 'synced' (beneran udah dicek & baris outbox-nya udah gak ada,
 * berarti syncOutbox() sukses & backend udah terima). Kalau dua state
 * ini disamakan, Receipt bisa sempat nunjukin "tersinkron" padahal
 * belum sempat dicek sama sekali -- itu overclaim yang eksplisit
 * dilarang.
 */
export type TransactionSyncStatus = 'checking' | OutboxStatus | 'synced'

/**
 * Baca status sync SATU transaksi spesifik (by Idempotency-Key/id
 * outbox) -- buat Receipt nentuin wording yang akurat (bukan cuma
 * hitungan global kayak useOutboxStatus()). Read-only, gak ada
 * mekanisme sync baru -- baris yang udah gak ada di outbox berarti
 * `syncOutbox()` (outbox.ts, TIDAK diubah) udah berhasil ngirim &
 * ngehapusnya.
 */
export function useTransactionSyncStatus(idempotencyKey: string): TransactionSyncStatus {
  // Dexie .get() balikin `undefined` juga kalau baris gak ketemu --
  // itu SAMA persis sama nilai yang dipakai dexie-react-hooks buat
  // "belum sempat resolve sama sekali". Biar dua kondisi ini KETUKAR
  // gak ambigu, querier di sini SELALU balikin objek yang jelas
  // (`{entry: ...}`) -- baru `result === undefined` (bukan `.entry`)
  // yang berarti "beneran belum sempat dicek".
  const result = useLiveQuery(async () => {
    const entry = await db.outboxTransactions.get(idempotencyKey)
    return { entry: entry ?? null }
  }, [idempotencyKey])

  if (result === undefined) return 'checking'
  if (result.entry === null) return 'synced'
  return result.entry.status
}
