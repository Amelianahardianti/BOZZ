import { afterEach, describe, expect, it, vi } from 'vitest'
import * as authContext from '../../../shell/auth/auth-context'
import { apiRequest } from '..'

vi.mock('../../../shell/auth/auth-context', () => ({ notifyUnauthorized: vi.fn() }))
const mockedNotifyUnauthorized = vi.mocked(authContext.notifyUnauthorized)

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.clearAllMocks()
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

  describe('notifyUnauthorized (auto-logout pas token ditolak backend)', () => {
    it('401 TANPA token (mis. login gagal salah password) -- BUKAN sesi kedaluwarsa, gak nge-trigger', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Username atau password salah.' } }),
      }) as unknown as typeof fetch

      await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toThrow()

      expect(mockedNotifyUnauthorized).not.toHaveBeenCalled()
    })

    it('401 DENGAN token (request otentik ditolak -- sesi kedaluwarsa/dicabut) -- nge-trigger', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Sesi login tidak valid atau sudah habis.' } }),
      }) as unknown as typeof fetch

      await expect(apiRequest('/auth/me', { token: 'token-lama' })).rejects.toThrow()

      expect(mockedNotifyUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('403 (bukan 401) dengan token -- gak nge-trigger, itu bukan soal sesi', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 403,
        ok: false,
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'Kamu tidak punya akses.' } }),
      }) as unknown as typeof fetch

      await expect(apiRequest('/staff', { token: 'token-kasir' })).rejects.toThrow()

      expect(mockedNotifyUnauthorized).not.toHaveBeenCalled()
    })
  })
})
