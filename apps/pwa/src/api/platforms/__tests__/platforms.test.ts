import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, type AuthSession } from '../shell/auth/auth-context'
import { connectPlatform, disconnectPlatform, fetchPlatforms, syncPlatform } from './platforms'

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

describe('fetchPlatforms', () => {
  it('GET /platforms, balikin array langsung', async () => {
    const fetchMock = mockFetchOnce(200, [{ id: '1', platform_name: 'shopee', is_connected: true }])

    const result = await fetchPlatforms()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/platforms')
    expect(init.headers.Authorization).toBe('Bearer token-owner-uji')
    expect(result).toEqual([{ id: '1', platform_name: 'shopee', is_connected: true }])
  })
})

describe('connectPlatform', () => {
  it('POST /platforms/:platform/connect dengan oauth_code placeholder (mode mock)', async () => {
    const fetchMock = mockFetchOnce(200, { id: '1', platform_name: 'shopee', is_connected: true })

    await connectPlatform('shopee')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/platforms/shopee/connect')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ oauth_code: 'MOCK_CODE' })
  })
})

describe('disconnectPlatform', () => {
  it('POST /platforms/:platform/disconnect', async () => {
    const fetchMock = mockFetchOnce(200, { id: '1', platform_name: 'shopee', is_connected: false })

    await disconnectPlatform('shopee')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/platforms/shopee/disconnect')
    expect(init.method).toBe('POST')
  })
})

describe('syncPlatform', () => {
  it('POST /platforms/:platform/sync', async () => {
    const fetchMock = mockFetchOnce(202, { id: '1', platform_name: 'shopee', is_connected: true })

    await syncPlatform('shopee')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/platforms/shopee/sync')
    expect(init.method).toBe('POST')
  })
})

describe('tanpa sesi login', () => {
  it('lempar error, gak manggil fetch sama sekali', async () => {
    localStorage.clear()
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(fetchPlatforms()).rejects.toThrow(/tanpa sesi login/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
