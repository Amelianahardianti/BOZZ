import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TransactionCreateRequest } from '../../../api/transactions'
import { db } from '../db'
import { useOutboxStatus } from '../useOutboxStatus'

const samplePayload: TransactionCreateRequest = {
  type: 'walk_in',
  payment_method: 'cash',
  amount_paid: 10000,
  items: [{ product_id: 'produk-1', qty: 1 }],
}

beforeEach(async () => {
  await db.outboxTransactions.clear()
})

describe('useOutboxStatus', () => {
  it('mulai dari 0/0 kalau outbox kosong', async () => {
    const { result } = renderHook(() => useOutboxStatus())

    await waitFor(() => expect(result.current).toEqual({ pendingCount: 0, failedCount: 0 }))
  })

  it('ngitung pending (termasuk "syncing") dan failed secara terpisah', async () => {
    await db.outboxTransactions.bulkAdd([
      { id: 'a', kind: 'transaction', payload: samplePayload, status: 'pending', attempts: 0, lastError: null, createdAt: new Date().toISOString() },
      { id: 'b', kind: 'transaction', payload: samplePayload, status: 'syncing', attempts: 1, lastError: null, createdAt: new Date().toISOString() },
      { id: 'c', kind: 'transaction', payload: samplePayload, status: 'failed', attempts: 2, lastError: 'gagal', createdAt: new Date().toISOString() },
    ])

    const { result } = renderHook(() => useOutboxStatus())

    await waitFor(() => expect(result.current).toEqual({ pendingCount: 2, failedCount: 1 }))
  })

  it('reaktif -- update otomatis pas ada baris baru masuk outbox, tanpa re-render manual', async () => {
    const { result } = renderHook(() => useOutboxStatus())
    await waitFor(() => expect(result.current.pendingCount).toBe(0))

    await act(async () => {
      await db.outboxTransactions.add({
        id: 'baru',
        kind: 'transaction',
        payload: samplePayload,
        status: 'pending',
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
      })
    })

    await waitFor(() => expect(result.current.pendingCount).toBe(1))
  })
})
