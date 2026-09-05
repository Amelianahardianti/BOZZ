import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CachedProduct } from '../../../shell/offline/db'
import { ReceiptView, type CompletedCheckout } from '../ReceiptView'

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
    render(<ReceiptView checkout={buildCheckout()} storeSettings={null} onNewTransaction={vi.fn()} />)

    expect(screen.getByText('Kopi Susu')).toBeInTheDocument()
    expect(screen.getByText(/2 x Rp\s*18\.000/)).toBeInTheDocument()
    expect(screen.getAllByText(/Rp\s*36\.000/).length).toBeGreaterThan(0) // subtotal (juga muncul di baris item)
    expect(screen.getByText(/Rp\s*50\.000/)).toBeInTheDocument() // diterima
    expect(screen.getByText(/Rp\s*14\.000/)).toBeInTheDocument() // kembalian = 50000-36000
  })

  it('transfer/ewallet -- gak nampilin baris diterima/kembali sama sekali', () => {
    render(
      <ReceiptView
        checkout={buildCheckout({ paymentMethod: 'transfer', amountPaid: null })}
        storeSettings={null}
        onNewTransaction={vi.fn()}
      />,
    )

    expect(screen.queryByText('Diterima')).not.toBeInTheDocument()
    expect(screen.queryByText('Kembali')).not.toBeInTheDocument()
  })

  it('storeSettings null (cache belum pernah sync) -- fallback "Toko" & "Terima kasih!", gak nge-crash', () => {
    render(<ReceiptView checkout={buildCheckout()} storeSettings={null} onNewTransaction={vi.fn()} />)

    expect(screen.getByText('Toko')).toBeInTheDocument()
    expect(screen.getByText('Terima kasih!')).toBeInTheDocument()
  })

  it('storeSettings terisi -- nama toko, alamat, telepon, logo, dan catatan kaki custom ikut tampil', () => {
    render(
      <ReceiptView
        checkout={buildCheckout()}
        storeSettings={{
          business_name: 'Kopi Kita',
          address: 'Jl. Melati No. 5',
          phone: '08123456789',
          logo_url: 'data:image/jpeg;base64,xxxx',
          receipt_footer_note: 'Sampai jumpa lagi!',
        }}
        onNewTransaction={vi.fn()}
      />,
    )

    expect(screen.getByText('Kopi Kita')).toBeInTheDocument()
    expect(screen.getByText('Jl. Melati No. 5')).toBeInTheDocument()
    expect(screen.getByText('08123456789')).toBeInTheDocument()
    expect(screen.getByAltText('Logo toko')).toHaveAttribute('src', 'data:image/jpeg;base64,xxxx')
    expect(screen.getByText('Sampai jumpa lagi!')).toBeInTheDocument()
    expect(screen.queryByText('Terima kasih!')).not.toBeInTheDocument()
  })

  it('storeSettings terisi tapi logo_url kosong -- gak nampilin <img> sama sekali', () => {
    render(
      <ReceiptView
        checkout={buildCheckout()}
        storeSettings={{
          business_name: 'Kopi Kita',
          address: null,
          phone: null,
          logo_url: null,
          receipt_footer_note: null,
        }}
        onNewTransaction={vi.fn()}
      />,
    )

    expect(screen.queryByAltText('Logo toko')).not.toBeInTheDocument()
  })

  it('tombol Cetak Struk manggil window.print()', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()

    render(<ReceiptView checkout={buildCheckout()} storeSettings={null} onNewTransaction={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Cetak Struk' }))

    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('tombol Transaksi Baru manggil onNewTransaction', async () => {
    const onNewTransaction = vi.fn()
    const user = userEvent.setup()

    render(<ReceiptView checkout={buildCheckout()} storeSettings={null} onNewTransaction={onNewTransaction} />)
    await user.click(screen.getByRole('button', { name: 'Transaksi Baru' }))

    expect(onNewTransaction).toHaveBeenCalledTimes(1)
  })
})
