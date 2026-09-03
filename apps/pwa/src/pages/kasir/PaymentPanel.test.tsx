import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaymentPanel } from './PaymentPanel'

describe('PaymentPanel', () => {
  it('default-nya cash, amount_paid udah keisi pas subtotal (kembalian 0)', () => {
    render(<PaymentPanel subtotal={20000} onBack={vi.fn()} onConfirm={vi.fn()} />)

    expect(screen.getByLabelText('Uang diterima')).toHaveValue(20000)
    expect(screen.getByText('Kembalian').nextSibling).toHaveTextContent(/Rp\s*0$/)
  })

  it('hitung kembalian bener pas uang diterima lebih gede dari subtotal', async () => {
    const user = userEvent.setup()
    render(<PaymentPanel subtotal={20000} onBack={vi.fn()} onConfirm={vi.fn()} />)

    await user.clear(screen.getByLabelText('Uang diterima'))
    await user.type(screen.getByLabelText('Uang diterima'), '50000')

    expect(screen.getByText('Kembalian').nextSibling).toHaveTextContent(/Rp\s*30\.000/)
  })

  it('tombol "Selesaikan Transaksi" disabled kalau uang diterima KURANG dari subtotal', async () => {
    const user = userEvent.setup()
    render(<PaymentPanel subtotal={20000} onBack={vi.fn()} onConfirm={vi.fn()} />)

    await user.clear(screen.getByLabelText('Uang diterima'))
    await user.type(screen.getByLabelText('Uang diterima'), '10000')

    expect(screen.getByRole('button', { name: 'Selesaikan Transaksi' })).toBeDisabled()
    expect(screen.getByText(/kurang dari total belanja/)).toBeInTheDocument()
  })

  it('onConfirm dipanggil dengan payload cash yang benar', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<PaymentPanel subtotal={20000} onBack={vi.fn()} onConfirm={onConfirm} />)

    await user.clear(screen.getByLabelText('Uang diterima'))
    await user.type(screen.getByLabelText('Uang diterima'), '50000')
    await user.click(screen.getByRole('button', { name: 'Selesaikan Transaksi' }))

    expect(onConfirm).toHaveBeenCalledWith({ type: 'walk_in', payment_method: 'cash', amount_paid: 50000 })
  })

  it('pindah ke transfer -- field "Uang diterima" hilang, amount_paid dikirim null (SRS: cuma cash yang isi amount_paid)', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<PaymentPanel subtotal={20000} onBack={vi.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'transfer' }))
    expect(screen.queryByLabelText('Uang diterima')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Selesaikan Transaksi' }))
    expect(onConfirm).toHaveBeenCalledWith({ type: 'walk_in', payment_method: 'transfer', amount_paid: null })
  })

  it('e-wallet juga sama -- tetap bisa confirm tanpa amount_paid', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<PaymentPanel subtotal={20000} onBack={vi.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'E-wallet' }))
    await user.click(screen.getByRole('button', { name: 'Selesaikan Transaksi' }))

    expect(onConfirm).toHaveBeenCalledWith({ type: 'walk_in', payment_method: 'ewallet', amount_paid: null })
  })

  it('bisa ganti jenis transaksi ke pre_order', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<PaymentPanel subtotal={20000} onBack={vi.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Pre-order' }))
    await user.click(screen.getByRole('button', { name: 'Selesaikan Transaksi' }))

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'pre_order' }))
  })

  it('tombol quick-amount nambah ke subtotal (bukan ganti angka mentah)', async () => {
    const user = userEvent.setup()
    render(<PaymentPanel subtotal={20000} onBack={vi.fn()} onConfirm={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /50\.000/ }))

    expect(screen.getByLabelText('Uang diterima')).toHaveValue(70000)
  })

  it('tombol "Kembali" manggil onBack', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<PaymentPanel subtotal={20000} onBack={onBack} onConfirm={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Kembali' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
