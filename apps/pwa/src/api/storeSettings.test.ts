import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, type AuthSession } from '../shell/auth/auth-context'
import { fetchStoreSettings, updateStoreSettings } from './storeSettings'

const originalFetch = globalThis.fetch

const session: AuthSession = {
  token: 'token-owner-uji',
  user: { id: 'user-1', name: 'Owner', email_or_username: 'owner', role: 'owner', phone: null, is_active: true },
}

beforeEach(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
})

afterEach(() => {
  localStorage.clear()
  globalThis.fetch = originalFetch
})

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('fetchStoreSettings', () => {
  it('GET /store-settings dengan token', async () => {
    const fetchMock = mockFetchOnce(200, { id: '1', business_name: 'Toko Saya' })

    const result = await fetchStoreSettings()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/store-settings')
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer token-owner-uji')
    expect(result.business_name).toBe('Toko Saya')
  })
})

describe('updateStoreSettings', () => {
  it('PATCH /store-settings dengan body perubahannya', async () => {
    const fetchMock = mockFetchOnce(200, { id: '1', business_name: 'Toko Baru' })

    await updateStoreSettings({ business_name: 'Toko Baru' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/store-settings')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ business_name: 'Toko Baru' })
  })
})

describe('tanpa sesi login', () => {
  it('lempar error (rejection), gak manggil fetch sama sekali', async () => {
    localStorage.clear()
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(fetchStoreSettings()).rejects.toThrow(/tanpa sesi login/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
