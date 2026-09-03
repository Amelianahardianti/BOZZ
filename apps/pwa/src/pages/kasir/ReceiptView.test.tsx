import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CachedProduct } from '../../shell/offline/db'
import { ReceiptView, type CompletedCheckout } from './ReceiptView'

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

function buildCheckout(overrides: Partial<CompletedCheckout> = {}): CompletedCheckout {
  return {
    idempotencyKey: '12345678-abcd-1234-abcd-123456789012',
    type: 'walk_in',
    paymentMethod: 'cash',
    amountPaid: 50000,
    items: [{ product: buildProduct(), qty: 2 }],
    subtotal: 36000,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReceiptView', () => {
  it('nampilin item, subtotal, uang diterima, dan kembalian yang bener', () => {
    render(<ReceiptView checkout={buildCheckout()} onNewTransaction={vi.fn()} />)

    expect(screen.getByText(/Kopi Susu/)).toBeInTheDocument()
    expect(screen.getByText(/x2/)).toBeInTheDocument()
    expect(screen.getAllByText(/Rp\s*36\.000/).length).toBeGreaterThan(0) // subtotal (juga muncul di baris item)
    expect(screen.getByText(/Rp\s*50\.000/)).toBeInTheDocument() // uang diterima
    expect(screen.getByText(/Rp\s*14\.000/)).toBeInTheDocument() // kembalian = 50000-36000
  })

  it('transfer/ewallet -- gak nampilin baris uang diterima/kembalian sama sekali', () => {
    render(
      <ReceiptView
        checkout={buildCheckout({ paymentMethod: 'transfer', amountPaid: null })}
        onNewTransaction={vi.fn()}
      />,
    )

    expect(screen.queryByText('Uang diterima')).not.toBeInTheDocument()
    expect(screen.queryByText('Kembalian')).not.toBeInTheDocument()
  })

  it('tombol Cetak Struk manggil window.print()', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()

    render(<ReceiptView checkout={buildCheckout()} onNewTransaction={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Cetak Struk' }))

    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('tombol Transaksi Baru manggil onNewTransaction', async () => {
    const onNewTransaction = vi.fn()
    const user = userEvent.setup()

    render(<ReceiptView checkout={buildCheckout()} onNewTransaction={onNewTransaction} />)
    await user.click(screen.getByRole('button', { name: 'Transaksi Baru' }))

    expect(onNewTransaction).toHaveBeenCalledTimes(1)
  })
})
