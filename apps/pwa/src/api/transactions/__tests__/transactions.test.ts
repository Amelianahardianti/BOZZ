import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, type AuthSession } from '../shell/auth/auth-context'
import { postTransaction, type TransactionCreateRequest } from './transactions'

const originalFetch = globalThis.fetch

const session: AuthSession = {
  token: 'token-owner-uji',
  user: {
    id: 'user-1',
    name: 'Owner Uji',
    email_or_username: 'owner',
    role: 'owner',
    phone: null,
    is_active: true,
  },
}

const payload: TransactionCreateRequest = {
  type: 'walk_in',
  payment_method: 'cash',
  amount_paid: 20000,
  items: [{ product_id: 'produk-1', qty: 2 }],
}

beforeEach(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
})

afterEach(() => {
  localStorage.clear()
  globalThis.fetch = originalFetch
})

describe('postTransaction', () => {
  it('POST ke /transactions dengan header Idempotency-Key & Authorization yang benar (SRS 9.3)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ id: 'tx-1', idempotency_key: 'key-123' }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await postTransaction(payload, 'key-123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/transactions')
    expect(init.method).toBe('POST')
    expect(init.headers['Idempotency-Key']).toBe('key-123')
    expect(init.headers.Authorization).toBe('Bearer token-owner-uji')
    expect(JSON.parse(init.body)).toEqual(payload)
  })

  it('lempar error kalau dipanggil tanpa sesi login (harusnya gak pernah kejadian, checkout wajib login)', async () => {
    localStorage.clear()

    await expect(postTransaction(payload, 'key-123')).rejects.toThrow(/tanpa sesi login/)
  })
})
