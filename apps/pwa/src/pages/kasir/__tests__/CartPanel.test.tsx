import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CachedProduct } from '../../shell/offline/db'
import { CartPanel } from './CartPanel'
import type { CartItem } from './types'

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

describe('CartPanel', () => {
  it('keranjang kosong -- tombol Bayar disabled, ada pesan kosong', () => {
    render(<CartPanel items={[]} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} onCheckout={vi.fn()} />)

    expect(screen.getByText('Belum ada barang dipilih.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bayar' })).toBeDisabled()
  })

  it('nampilin item + subtotal (harga x qty, dijumlah semua)', () => {
    const items: CartItem[] = [
      { product: buildProduct({ id: 'a', name: 'Kopi Susu', price: 18000 }), qty: 2 },
      { product: buildProduct({ id: 'b', name: 'Roti Bakar', price: 15000 }), qty: 1 },
    ]

    render(<CartPanel items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} onCheckout={vi.fn()} />)

    expect(screen.getByText('Kopi Susu')).toBeInTheDocument()
    expect(screen.getByText('Roti Bakar')).toBeInTheDocument()
    // Subtotal = (18000*2) + (15000*1) = 51000
    expect(screen.getByText(/Rp\s*51\.000/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bayar' })).toBeEnabled()
  })

  it('tombol +/- manggil onIncrement/onDecrement dengan product id yang benar', async () => {
    const onIncrement = vi.fn()
    const onDecrement = vi.fn()
    const user = userEvent.setup()
    const items: CartItem[] = [{ product: buildProduct({ id: 'produk-x' }), qty: 1 }]

    render(<CartPanel items={items} onIncrement={onIncrement} onDecrement={onDecrement} onRemove={vi.fn()} onCheckout={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Tambah qty/ }))
    await user.click(screen.getByRole('button', { name: /Kurangi qty/ }))

    expect(onIncrement).toHaveBeenCalledWith('produk-x')
    expect(onDecrement).toHaveBeenCalledWith('produk-x')
  })

  it('tombol Hapus manggil onRemove dengan product id yang benar', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    const items: CartItem[] = [{ product: buildProduct({ id: 'produk-y', name: 'Es Teh' }), qty: 1 }]

    render(<CartPanel items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={onRemove} onCheckout={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Hapus Es Teh/ }))

    expect(onRemove).toHaveBeenCalledWith('produk-y')
  })

  it('klik Bayar manggil onCheckout', async () => {
    const onCheckout = vi.fn()
    const user = userEvent.setup()
    const items: CartItem[] = [{ product: buildProduct(), qty: 1 }]

    render(<CartPanel items={items} onIncrement={vi.fn()} onDecrement={vi.fn()} onRemove={vi.fn()} onCheckout={onCheckout} />)

    await user.click(screen.getByRole('button', { name: 'Bayar' }))

    expect(onCheckout).toHaveBeenCalledTimes(1)
  })
})
