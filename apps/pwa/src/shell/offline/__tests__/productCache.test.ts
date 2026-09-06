import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as categoriesApi from '../../../api/categories'
import type { Category } from '../../../api/categories'
import * as productsApi from '../../../api/products'
import type { Product } from '../../../api/products'
import { db } from '../db'
import { getCachedCategories, getCachedProducts, syncProductCache } from '../productCache'

vi.mock('../../../api/categories', () => ({ fetchCategories: vi.fn() }))
vi.mock('../../../api/products', () => ({ fetchAllProducts: vi.fn() }))

const mockedFetchCategories = vi.mocked(categoriesApi.fetchCategories)
const mockedFetchAllProducts = vi.mocked(productsApi.fetchAllProducts)

function buildProduct(overrides: Partial<Product> = {}): Product {
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
    ...overrides,
  }
}

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'kategori-1',
    name: 'Minuman',
    created_by: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(async () => {
  await db.products.clear()
  await db.categories.clear()
  vi.clearAllMocks()
})

describe('syncProductCache', () => {
  it('narik produk+kategori dari server, simpen ke IndexedDB dengan cachedAt', async () => {
    mockedFetchAllProducts.mockResolvedValue([buildProduct()])
    mockedFetchCategories.mockResolvedValue([buildCategory()])

    await syncProductCache()

    const products = await db.products.toArray()
    const categories = await db.categories.toArray()
    expect(products).toHaveLength(1)
    expect(products[0].name).toBe('Kopi Susu')
    expect(typeof products[0].cachedAt).toBe('string')
    expect(categories).toHaveLength(1)
    expect(categories[0].name).toBe('Minuman')
  })

  it('nyapu data lama sebelum diisi yang baru (bukan numpuk)', async () => {
    await db.products.add({ ...buildProduct({ id: 'produk-lama' }), cachedAt: new Date().toISOString() })
    mockedFetchAllProducts.mockResolvedValue([buildProduct({ id: 'produk-baru' })])
    mockedFetchCategories.mockResolvedValue([])

    await syncProductCache()

    const products = await db.products.toArray()
    expect(products.map((p) => p.id)).toEqual(['produk-baru'])
  })
})

describe('getCachedProducts', () => {
  it('cuma balikin produk yang is_active, produk nonaktif disaring', async () => {
    const now = new Date().toISOString()
    await db.products.bulkAdd([
      { ...buildProduct({ id: 'aktif', is_active: true }), cachedAt: now },
      { ...buildProduct({ id: 'nonaktif', is_active: false }), cachedAt: now },
    ])

    const result = await getCachedProducts()

    expect(result.map((p) => p.id)).toEqual(['aktif'])
  })

  it('cache kosong (belum pernah sync) balikin array kosong, bukan error', async () => {
    await expect(getCachedProducts()).resolves.toEqual([])
  })
})

describe('getCachedCategories', () => {
  it('balikin semua kategori yang tersimpan', async () => {
    await db.categories.add({ ...buildCategory(), cachedAt: new Date().toISOString() })

    const result = await getCachedCategories()

    expect(result).toHaveLength(1)
  })
})
