import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './client'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('apiRequest', () => {
  it('balikin data kalau response OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ hello: 'world' }),
    }) as unknown as typeof fetch

    await expect(apiRequest<{ hello: string }>('/ping')).resolves.toEqual({ hello: 'world' })
  })

  it('lempar ApiRequestError sesuai bentuk { error } dari backend (SRS 9.7)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Username atau password salah.' } }),
    }) as unknown as typeof fetch

    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Username atau password salah.',
    })
  })

  it('lempar ApiRequestError NETWORK_ERROR kalau fetch gagal total (server mati/offline)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch

    await expect(apiRequest('/ping')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('204 balikin undefined tanpa coba parse body', async () => {
    const json = vi.fn()
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 204, ok: true, json }) as unknown as typeof fetch

    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()
  })
})
