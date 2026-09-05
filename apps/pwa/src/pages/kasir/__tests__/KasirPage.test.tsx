import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CachedCategory, CachedProduct, CachedStoreSettings } from '../../../shell/offline/db'
import * as outbox from '../../../shell/offline/outbox'
import * as productCache from '../../../shell/offline/productCache'
import * as storeSettingsCache from '../../../shell/offline/storeSettingsCache'
import { KasirPage } from '../KasirPage'

vi.mock('../../../shell/offline/productCache', () => ({
  getCachedProducts: vi.fn(),
  getCachedCategories: vi.fn(),
  syncProductCache: vi.fn(),
}))
vi.mock('../../../shell/offline/storeSettingsCache', () => ({
  getCachedStoreSettings: vi.fn(),
  syncStoreSettingsCache: vi.fn(),
}))
vi.mock('../../../shell/offline/outbox', () => ({ enqueueTransaction: vi.fn() }))

const mockedGetCachedProducts = vi.mocked(productCache.getCachedProducts)
const mockedGetCachedCategories = vi.mocked(productCache.getCachedCategories)
const mockedSyncProductCache = vi.mocked(productCache.syncProductCache)
const mockedGetCachedStoreSettings = vi.mocked(storeSettingsCache.getCachedStoreSettings)
const mockedSyncStoreSettingsCache = vi.mocked(storeSettingsCache.syncStoreSettingsCache)
const mockedEnqueueTransaction = vi.mocked(outbox.enqueueTransaction)

function buildStoreSettings(overrides: Partial<CachedStoreSettings> = {}): CachedStoreSettings {
  return {
    id: 'settings-1',
    business_name: 'Toko Saya',
    address: null,
    phone: null,
    receipt_footer_note: null,
    logo_url: null,
    updated_by: null,
    updated_at: new Date().toISOString(),
    cacheKey: 'current',
    cachedAt: new Date().toISOString(),
    ...overrides,
  }
}

function buildProduct(overrides: Partial<CachedProduct> = {}): CachedProduct {
  return {
    id: 'produk-1',
    category_id: null,
    category_name: null,
    name: 'Kopi Susu',
    sku: null,
    price: 18000,
    cost_price: null,
    stock_qty: 10,
    low_stock_threshold: 5,
    image_url: null,
    unit: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    cachedAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedGetCachedProducts.mockResolvedValue([buildProduct()])
  mockedGetCachedCategories.mockResolvedValue([] as CachedCategory[])
  mockedSyncProductCache.mockResolvedValue(undefined)
  mockedGetCachedStoreSettings.mockResolvedValue(buildStoreSettings())
  mockedSyncStoreSettingsCache.mockResolvedValue(undefined)
  mockedEnqueueTransaction.mockResolvedValue('key-uji-123')
})

describe('KasirPage -- alur checkout lengkap', () => {
  it('sync cache produk & profil toko otomatis pas mount (device online)', async () => {
    render(<KasirPage />)

    await screen.findByRole('button', { name: /Kopi Susu/ })
    expect(mockedSyncProductCache).toHaveBeenCalledTimes(1)
    expect(mockedSyncStoreSettingsCache).toHaveBeenCalledTimes(1)
  })

  it('pilih produk -> bayar -> struk -> transaksi baru (alur penuh, cart kereset)', async () => {
    const user = userEvent.setup()
    render(<KasirPage />)

    // 1. Pilih produk (1 tap masuk keranjang -- NFR-05)
    await user.click(await screen.findByRole('button', { name: /Kopi Susu/ }))
    expect(await screen.findByRole('button', { name: 'Bayar' })).toBeEnabled()

    // 2. Ke halaman bayar
    await user.click(screen.getByRole('button', { name: 'Bayar' }))
    expect(await screen.findByLabelText('Uang diterima')).toHaveValue(18000) // default pas subtotal

    // 3. Selesaikan transaksi (cash, pas)
    await user.click(screen.getByRole('button', { name: 'Selesaikan Transaksi' }))

    // 4. enqueueTransaction dipanggil dengan payload yang benar
    expect(mockedEnqueueTransaction).toHaveBeenCalledWith({
      type: 'walk_in',
      payment_method: 'cash',
      amount_paid: 18000,
      items: [{ product_id: 'produk-1', qty: 1 }],
    })

    // 5. Struk muncul, header pakai profil toko dari cache (bukan hardcoded)
    expect(await screen.findByText('Transaksi Berhasil')).toBeInTheDocument()
    expect(screen.getByText('Toko Saya')).toBeInTheDocument()
    expect(screen.getByText(/Kopi Susu/)).toBeInTheDocument()

    // 6. Transaksi baru -- balik ke shopping, keranjang kosong
    await user.click(screen.getByRole('button', { name: 'Transaksi Baru' }))
    expect(await screen.findByText('Belum ada barang dipilih.')).toBeInTheDocument()
  })

  it('nambah produk yang sama 2x -> qty di keranjang jadi 2, bukan 2 baris terpisah', async () => {
    const user = userEvent.setup()
    render(<KasirPage />)

    const productButton = await screen.findByRole('button', { name: /Kopi Susu/ })
    await user.click(productButton)
    await user.click(productButton)

    await user.click(screen.getByRole('button', { name: 'Bayar' }))
    // Subtotal = 18000 * 2 = 36000 -- default amount_paid pas subtotal.
    expect(await screen.findByLabelText('Uang diterima')).toHaveValue(36000)
  })

  it('tombol Kembali di halaman bayar balik ke shopping TANPA ngosongin keranjang', async () => {
    const user = userEvent.setup()
    render(<KasirPage />)

    await user.click(await screen.findByRole('button', { name: /Kopi Susu/ }))
    await user.click(screen.getByRole('button', { name: 'Bayar' }))
    await user.click(await screen.findByRole('button', { name: 'Kembali' }))

    // Keranjang masih ada isinya (bukan "Belum ada barang dipilih") --
    // "Kopi Susu" muncul 2x (nama produk di grid + nama item di cart).
    expect(await screen.findAllByText('Kopi Susu')).toHaveLength(2)
    expect(screen.queryByText('Belum ada barang dipilih.')).not.toBeInTheDocument()
  })

  it('transfer/ewallet -- amount_paid null, gak nunggu input uang', async () => {
    const user = userEvent.setup()
    render(<KasirPage />)

    await user.click(await screen.findByRole('button', { name: /Kopi Susu/ }))
    await user.click(screen.getByRole('button', { name: 'Bayar' }))
    await user.click(await screen.findByRole('button', { name: 'transfer' }))
    await user.click(screen.getByRole('button', { name: 'Selesaikan Transaksi' }))

    expect(mockedEnqueueTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: 'transfer', amount_paid: null }),
    )
  })
})
