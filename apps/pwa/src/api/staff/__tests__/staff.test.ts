import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, type AuthSession } from '../../../shell/auth/auth-context'
import { activateStaff, createStaff, deactivateStaff, fetchStaff, updateStaff } from '..'

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

describe('fetchStaff', () => {
  it('GET /staff, balikin array data-nya (bukan wrapper paginated)', async () => {
    const fetchMock = mockFetchOnce(200, { data: [{ id: '1', name: 'Budi' }], page: 1, limit: 20, total: 1 })

    const result = await fetchStaff()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff')
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer token-owner-uji')
    expect(result).toEqual([{ id: '1', name: 'Budi' }])
  })
})

describe('createStaff', () => {
  it('POST /staff dengan body yang benar', async () => {
    const fetchMock = mockFetchOnce(201, { id: 'new-1' })

    await createStaff({ name: 'Budi', email_or_username: 'budi', password: 'budi123', role: 'kasir' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      name: 'Budi',
      email_or_username: 'budi',
      password: 'budi123',
      role: 'kasir',
    })
  })
})

describe('updateStaff', () => {
  it('PATCH /staff/:id dengan body perubahannya', async () => {
    const fetchMock = mockFetchOnce(200, { id: '1' })

    await updateStaff('1', { name: 'Nama Baru' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff/1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ name: 'Nama Baru' })
  })
})

describe('deactivateStaff', () => {
  it('PATCH /staff/:id/deactivate', async () => {
    const fetchMock = mockFetchOnce(200, { id: '1', is_active: false })

    await deactivateStaff('1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff/1/deactivate')
    expect(init.method).toBe('PATCH')
  })
})

describe('activateStaff', () => {
  it('PATCH /staff/:id/activate', async () => {
    const fetchMock = mockFetchOnce(200, { id: '1', is_active: true })

    await activateStaff('1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/staff/1/activate')
    expect(init.method).toBe('PATCH')
  })
})

describe('tanpa sesi login', () => {
  it('lempar error, gak manggil fetch sama sekali', async () => {
    localStorage.clear()
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(fetchStaff()).rejects.toThrow(/tanpa sesi login/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
