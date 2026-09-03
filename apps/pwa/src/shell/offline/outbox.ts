import { ApiRequestError } from '../../api/client'
import { postTransaction, type TransactionCreateRequest } from '../../api/transactions'
import { isOnline, subscribeToConnectivity } from './connectivity'
import { db, type OutboxTransaction } from './db'

const RETRY_INTERVAL_MS = 30_000

/**
 * Antre transaksi buat dikirim ke backend (FR-SI-06, NFR-02). Selalu
 * berhasil LANGSUNG -- nulis ke IndexedDB doang, gak nunggu jaringan
 * (NFR-01: <100ms, ini yang bikin acceptance criteria "struk siap <2
 * detik walau offline" kepenuhi -- struknya dicetak dari `payload`
 * yang baru diinput, bukan nunggu response server). Kalau device lagi
 * online, langsung dicoba dikirim di background lewat syncOutbox().
 *
 * @returns idempotencyKey -- ID baris outbox ini juga, dipakai UI
 *          buat lacak status transaksi ini (mis. cek udah ke-sync
 *          apa belum).
 */
export async function enqueueTransaction(payload: TransactionCreateRequest): Promise<string> {
  const idempotencyKey = crypto.randomUUID()

  const entry: OutboxTransaction = {
    id: idempotencyKey,
    kind: 'transaction',
    payload,
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  }

  await db.outboxTransactions.add(entry)

  if (isOnline()) {
    void syncOutbox()
  }

  return idempotencyKey
}

let isSyncRunning = false

/**
 * Kirim semua transaksi 'pending'/'failed' ke backend, satu-satu.
 * Aman dipanggil berkali-kali bersamaan (event 'online' + timer retry
 * bisa nyala bareng) -- kalau lagi jalan, panggilan lain di-skip aja;
 * baris yang belum sempat diproses bakal ke-pickup di panggilan
 * berikutnya (timer jalan tiap 30 detik, jadi gak ada yang nyangkut).
 */
export async function syncOutbox(): Promise<void> {
  if (isSyncRunning) return
  isSyncRunning = true

  try {
    const pending = await db.outboxTransactions.where('status').anyOf('pending', 'failed').toArray()

    for (const entry of pending) {
      await syncOne(entry)
    }
  } finally {
    isSyncRunning = false
  }
}

async function syncOne(entry: OutboxTransaction): Promise<void> {
  await db.outboxTransactions.update(entry.id, { status: 'syncing' })

  try {
    // idempotencyKey = entry.id -- kalau ini percobaan kirim ulang
    // (mis. attempt sebelumnya sukses di server tapi response-nya
    // gak sempat nyampe ke client karena koneksi putus pas itu juga),
    // backend balikin transaksi yang SAMA (SRS 9.3), bukan dobel.
    await postTransaction(entry.payload, entry.id)

    // Berhasil -- selesai tugasnya, hapus dari antrian. Data
    // transaksi yang beneran (buat Laporan dll) sumbernya backend.
    await db.outboxTransactions.delete(entry.id)
  } catch (err) {
    // 4xx asli dari server (bukan 0 = fetch gagal total/offline) itu
    // penolakan definitif -- mis. 409 stok gak cukup, 400 body salah.
    // Ngulang kirim payload yang SAMA gak bakal beda hasilnya, jadi
    // berhenti di 'failed' (nunggu ditangani manual/dibatalin), bukan
    // ngulang selamanya dan buang-buang percobaan.
    const isDefinitelyRejected = err instanceof ApiRequestError && err.status >= 400 && err.status < 500

    await db.outboxTransactions.update(entry.id, {
      status: isDefinitelyRejected ? 'failed' : 'pending',
      attempts: entry.attempts + 1,
      lastError: err instanceof Error ? err.message : 'Gagal sync, alasan tidak diketahui.',
    })
  }
}

/**
 * Nyalain sinkronisasi otomatis buat sisa umur aplikasi -- panggil
 * SEKALI pas app start (App.tsx). Tiga pemicu sync: langsung pas
 * start (kalau online), event 'online' browser, dan timer 30 detik
 * (jaga-jaga event 'online' gak kepicu tapi koneksi sebenarnya udah
 * balik -- itu kejadian nyata di beberapa browser/OS).
 *
 * @returns fungsi buat berhenti (dipakai test, biar gak ada timer
 *          nyangkut abis test selesai).
 */
export function initOutboxSync(): () => void {
  if (isOnline()) {
    void syncOutbox()
  }

  const unsubscribeConnectivity = subscribeToConnectivity((online) => {
    if (online) void syncOutbox()
  })

  const intervalId = setInterval(() => {
    if (isOnline()) void syncOutbox()
  }, RETRY_INTERVAL_MS)

  return () => {
    unsubscribeConnectivity()
    clearInterval(intervalId)
  }
}
