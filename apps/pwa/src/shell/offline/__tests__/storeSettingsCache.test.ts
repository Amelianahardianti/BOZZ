import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as storeSettingsApi from '../../../api/storeSettings'
import type { StoreSettings } from '../../../api/storeSettings'
import { db } from '../db'
import { getCachedStoreSettings, syncStoreSettingsCache } from '../storeSettingsCache'

vi.mock('../../../api/storeSettings', () => ({ fetchStoreSettings: vi.fn() }))

const mockedFetchStoreSettings = vi.mocked(storeSettingsApi.fetchStoreSettings)

function buildSettings(overrides: Partial<StoreSettings> = {}): StoreSettings {
  return {
    id: 'settings-1',
    business_name: 'Toko Saya',
    address: 'Jl. Mawar No. 1',
    phone: '08123456789',
    receipt_footer_note: null,
    logo_url: null,
    updated_by: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(async () => {
  await db.storeSettings.clear()
  vi.clearAllMocks()
})

describe('syncStoreSettingsCache', () => {
  it('narik profil toko dari server, simpen ke IndexedDB dengan cachedAt', async () => {
    mockedFetchStoreSettings.mockResolvedValue(buildSettings())

    await syncStoreSettingsCache()

    const cached = await db.storeSettings.get('current')
    expect(cached?.business_name).toBe('Toko Saya')
    expect(typeof cached?.cachedAt).toBe('string')
  })

  it('sync ulang NIMPA baris lama (bukan numpuk -- cuma satu toko)', async () => {
    mockedFetchStoreSettings.mockResolvedValue(buildSettings({ business_name: 'Nama Lama' }))
    await syncStoreSettingsCache()

    mockedFetchStoreSettings.mockResolvedValue(buildSettings({ business_name: 'Nama Baru' }))
    await syncStoreSettingsCache()

    const all = await db.storeSettings.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].business_name).toBe('Nama Baru')
  })
})

describe('getCachedStoreSettings', () => {
  it('balikin data yang tersimpan', async () => {
    await db.storeSettings.put({ ...buildSettings(), cacheKey: 'current', cachedAt: new Date().toISOString() })

    const result = await getCachedStoreSettings()

    expect(result?.business_name).toBe('Toko Saya')
  })

  it('cache kosong (belum pernah sync) balikin null, bukan error', async () => {
    await expect(getCachedStoreSettings()).resolves.toBeNull()
  })
})
