import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../../../api/client'
import * as transactionsApi from '../../../api/transactions'
import type { TransactionCreateRequest } from '../../../api/transactions'
import * as connectivity from '../connectivity'
import { db } from '../db'
import { enqueueTransaction, initOutboxSync, syncOutbox } from '../outbox'

vi.mock('../../../api/transactions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/transactions')>()
  return { ...actual, postTransaction: vi.fn() }
})
vi.mock('../connectivity', () => ({
  isOnline: vi.fn(() => true),
  subscribeToConnectivity: vi.fn(() => () => {}),
}))

const mockedPostTransaction = vi.mocked(transactionsApi.postTransaction)
const mockedIsOnline = vi.mocked(connectivity.isOnline)

const samplePayload: TransactionCreateRequest = {
  type: 'walk_in',
  payment_method: 'cash',
  amount_paid: 20000,
  items: [{ product_id: 'produk-1', qty: 2 }],
}

function sampleTransaction(idempotencyKey: string): transactionsApi.Transaction {
  return {
    id: 'tx-1',
    idempotency_key: idempotencyKey,
    type: 'walk_in',
    customer_id: null,
    cashier_user_id: 'user-1',
    payment_method: 'cash',
    subtotal: 20000,
    total_amount: 20000,
    amount_paid: 20000,
    change_amount: 0,
    status: 'completed',
    voided_at: null,
    voided_by: null,
    void_reason: null,
    synced_offline: true,
    items: [],
    created_at: new Date().toISOString(),
  }
}

beforeEach(async () => {
  await db.outboxTransactions.clear()
  vi.clearAllMocks()
  mockedIsOnline.mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('enqueueTransaction', () => {
  // isOnline dipaksa false di 2 test ini -- fokusnya nguji "nulis ke
  // outbox itu sendiri", bukan nguji jalur sync (itu tugas describe
  // 'syncOutbox' di bawah). Kalau online, enqueueTransaction() ikut
  // mancing syncOutbox() di background yang gak sengaja diuji di sini.
  it('langsung nulis ke IndexedDB dengan status pending, gak nunggu network', async () => {
    mockedIsOnline.mockReturnValue(false)

    const idempotencyKey = await enqueueTransaction(samplePayload)

    const entry = await db.outboxTransactions.get(idempotencyKey)
    expect(entry).toBeDefined()
    expect(entry?.status).toBe('pending')
    expect(entry?.payload).toEqual(samplePayload)
    expect(entry?.attempts).toBe(0)
    expect(mockedPostTransaction).not.toHaveBeenCalled()
  })

  it('idempotencyKey yang di-generate valid UUID', async () => {
    mockedIsOnline.mockReturnValue(false)

    const idempotencyKey = await enqueueTransaction(samplePayload)

    expect(idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('kalau lagi online, langsung mancing sync di background', async () => {
    mockedIsOnline.mockReturnValue(true)
    mockedPostTransaction.mockResolvedValue(sampleTransaction('placeholder'))

    const idempotencyKey = await enqueueTransaction(samplePayload)

    // syncOutbox() dipanggil fire-and-forget (gak di-await di dalam
    // enqueueTransaction), jadi tunggu sebentar biar microtask-nya jalan.
    await vi.waitFor(() => expect(mockedPostTransaction).toHaveBeenCalledWith(samplePayload, idempotencyKey))
  })
})

describe('syncOutbox', () => {
  it('sukses kirim -> entry dihapus dari outbox', async () => {
    const idempotencyKey = crypto.randomUUID()
    await db.outboxTransactions.add({
      id: idempotencyKey,
      kind: 'transaction',
      payload: samplePayload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    })
    mockedPostTransaction.mockResolvedValue(sampleTransaction(idempotencyKey))

    await syncOutbox()

    expect(mockedPostTransaction).toHaveBeenCalledWith(samplePayload, idempotencyKey)
    expect(await db.outboxTransactions.get(idempotencyKey)).toBeUndefined()
  })

  it('gagal karena network (status 0) -> tetap pending, attempts nambah, BUKAN failed', async () => {
    const idempotencyKey = crypto.randomUUID()
    await db.outboxTransactions.add({
      id: idempotencyKey,
      kind: 'transaction',
      payload: samplePayload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    })
    mockedPostTransaction.mockRejectedValue(new ApiRequestError(0, 'NETWORK_ERROR', 'Tidak bisa terhubung.'))

    await syncOutbox()

    const entry = await db.outboxTransactions.get(idempotencyKey)
    expect(entry?.status).toBe('pending')
    expect(entry?.attempts).toBe(1)
    expect(entry?.lastError).toContain('Tidak bisa terhubung')
  })

  it('ditolak server (409 stok gak cukup) -> failed, TIDAK diulang otomatis', async () => {
    const idempotencyKey = crypto.randomUUID()
    await db.outboxTransactions.add({
      id: idempotencyKey,
      kind: 'transaction',
      payload: samplePayload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    })
    mockedPostTransaction.mockRejectedValue(new ApiRequestError(409, 'CONFLICT', 'Stok tidak cukup.'))

    await syncOutbox()

    const entry = await db.outboxTransactions.get(idempotencyKey)
    expect(entry?.status).toBe('failed')
    expect(entry?.lastError).toBe('Stok tidak cukup.')
  })

  it('entry yang statusnya "failed" tetap ikut di-retry pas syncOutbox dipanggil lagi', async () => {
    const idempotencyKey = crypto.randomUUID()
    await db.outboxTransactions.add({
      id: idempotencyKey,
      kind: 'transaction',
      payload: samplePayload,
      status: 'failed',
      attempts: 1,
      lastError: 'error lama',
      createdAt: new Date().toISOString(),
    })
    mockedPostTransaction.mockResolvedValue(sampleTransaction(idempotencyKey))

    await syncOutbox()

    expect(mockedPostTransaction).toHaveBeenCalledTimes(1)
    expect(await db.outboxTransactions.get(idempotencyKey)).toBeUndefined()
  })

  it('idempotencyKey yang dikirim ke backend SAMA dengan id baris outbox-nya (SRS 9.3)', async () => {
    const idempotencyKey = crypto.randomUUID()
    await db.outboxTransactions.add({
      id: idempotencyKey,
      kind: 'transaction',
      payload: samplePayload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    })
    mockedPostTransaction.mockResolvedValue(sampleTransaction(idempotencyKey))

    await syncOutbox()

    expect(mockedPostTransaction.mock.calls[0][1]).toBe(idempotencyKey)
  })

  it('2 transaksi pending -> dua-duanya diproses', async () => {
    const keyA = crypto.randomUUID()
    const keyB = crypto.randomUUID()
    await db.outboxTransactions.bulkAdd([
      { id: keyA, kind: 'transaction', payload: samplePayload, status: 'pending', attempts: 0, lastError: null, createdAt: new Date().toISOString() },
      { id: keyB, kind: 'transaction', payload: samplePayload, status: 'pending', attempts: 0, lastError: null, createdAt: new Date().toISOString() },
    ])
    mockedPostTransaction.mockImplementation(async (_payload, key) => sampleTransaction(key))

    await syncOutbox()

    expect(mockedPostTransaction).toHaveBeenCalledTimes(2)
    expect(await db.outboxTransactions.count()).toBe(0)
  })

  it('dipanggil bersamaan (belum selesai yang pertama) -- gak dobel proses entry yang sama', async () => {
    const idempotencyKey = crypto.randomUUID()
    await db.outboxTransactions.add({
      id: idempotencyKey,
      kind: 'transaction',
      payload: samplePayload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    })

    let resolvePost!: (tx: transactionsApi.Transaction) => void
    mockedPostTransaction.mockImplementation(
      () => new Promise((resolve) => { resolvePost = resolve }),
    )

    const first = syncOutbox()
    const second = syncOutbox() // dipanggil sebelum `first` selesai -- harus di-skip

    // `first` masih beberapa await lagi (query DB, update status ke
    // 'syncing') sebelum beneran nyampe manggil postTransaction --
    // tunggu itu kejadian dulu baru resolvePost-nya kepakai.
    await vi.waitFor(() => expect(mockedPostTransaction).toHaveBeenCalled())
    resolvePost(sampleTransaction(idempotencyKey))
    await Promise.all([first, second])

    expect(mockedPostTransaction).toHaveBeenCalledTimes(1)
  })
})

describe('initOutboxSync', () => {
  it('cleanup function-nya berhenti listen ke event online (gak crash abis dipanggil)', () => {
    const stop = initOutboxSync()
    expect(() => stop()).not.toThrow()
  })
})
