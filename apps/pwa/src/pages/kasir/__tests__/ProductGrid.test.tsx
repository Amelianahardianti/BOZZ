import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CachedCategory, CachedProduct } from '../../shell/offline/db'
import { ProductGrid } from './ProductGrid'

function buildProduct(overrides: Partial<CachedProduct> = {}): CachedProduct {
  return {
    id: 'produk-1',
    category_id: null,
    category_name: null,
    name: 'Kopi Susu',
    sku: 'KS-001',
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

function buildCategory(overrides: Partial<CachedCategory> = {}): CachedCategory {
  return {
    id: 'kategori-1',
    name: 'Minuman',
    created_by: null,
    created_at: new Date().toISOString(),
    cachedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ProductGrid', () => {
  it('cache kosong -- nampilin pesan minta sync, bukan grid kosong biasa', () => {
    render(<ProductGrid products={[]} categories={[]} onAdd={vi.fn()} />)

    expect(screen.getByText(/Belum ada produk di cache/)).toBeInTheDocument()
  })

  it('klik produk manggil onAdd dengan produk yang benar (1 tap -- NFR-05)', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup()
    const product = buildProduct()

    render(<ProductGrid products={[product]} categories={[]} onAdd={onAdd} />)
    await user.click(screen.getByRole('button', { name: /Kopi Susu/ }))

    expect(onAdd).toHaveBeenCalledWith(product)
  })

  it('produk stok 0 -- tombolnya disabled, gak bisa ditambah', () => {
    render(<ProductGrid products={[buildProduct({ stock_qty: 0 })]} categories={[]} onAdd={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Kopi Susu/ })).toBeDisabled()
    expect(screen.getByText('Stok habis')).toBeInTheDocument()
  })

  it('search nyaring produk by nama', async () => {
    const user = userEvent.setup()
    const products = [buildProduct({ id: 'a', name: 'Kopi Susu' }), buildProduct({ id: 'b', name: 'Roti Bakar' })]

    render(<ProductGrid products={products} categories={[]} onAdd={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('Cari produk atau SKU...'), 'roti')

    expect(screen.queryByText('Kopi Susu')).not.toBeInTheDocument()
    expect(screen.getByText('Roti Bakar')).toBeInTheDocument()
  })

  it('search juga nyaring by SKU', async () => {
    const user = userEvent.setup()
    const products = [buildProduct({ id: 'a', name: 'Kopi Susu', sku: 'KS-001' }), buildProduct({ id: 'b', name: 'Roti Bakar', sku: 'RB-002' })]

    render(<ProductGrid products={products} categories={[]} onAdd={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('Cari produk atau SKU...'), 'rb-002')

    expect(screen.getByText('Roti Bakar')).toBeInTheDocument()
    expect(screen.queryByText('Kopi Susu')).not.toBeInTheDocument()
  })

  it('filter kategori cuma nampilin produk di kategori itu', async () => {
    const user = userEvent.setup()
    const categories = [buildCategory({ id: 'cat-a', name: 'Minuman' }), buildCategory({ id: 'cat-b', name: 'Makanan' })]
    const products = [
      buildProduct({ id: 'a', name: 'Kopi Susu', category_id: 'cat-a' }),
      buildProduct({ id: 'b', name: 'Roti Bakar', category_id: 'cat-b' }),
    ]

    render(<ProductGrid products={products} categories={categories} onAdd={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Makanan' }))

    expect(screen.queryByText('Kopi Susu')).not.toBeInTheDocument()
    expect(screen.getByText('Roti Bakar')).toBeInTheDocument()
  })

  it('"Semua" balikin filter kategori ke semua produk lagi', async () => {
    const user = userEvent.setup()
    const categories = [buildCategory({ id: 'cat-a', name: 'Minuman' })]
    const products = [buildProduct({ id: 'a', name: 'Kopi Susu', category_id: 'cat-a' }), buildProduct({ id: 'b', name: 'Roti Bakar', category_id: null })]

    render(<ProductGrid products={products} categories={categories} onAdd={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Minuman' }))
    await user.click(screen.getByRole('button', { name: 'Semua' }))

    expect(screen.getByText('Kopi Susu')).toBeInTheDocument()
    expect(screen.getByText('Roti Bakar')).toBeInTheDocument()
  })

  it('ada produk tapi hasil filter kosong -- pesan "gak ada yang cocok"', async () => {
    const user = userEvent.setup()
    render(<ProductGrid products={[buildProduct({ name: 'Kopi Susu' })]} categories={[]} onAdd={vi.fn()} />)

    await user.type(screen.getByPlaceholderText('Cari produk atau SKU...'), 'zzz-gak-ada')

    expect(screen.getByText('Gak ada produk yang cocok.')).toBeInTheDocument()
  })
})
