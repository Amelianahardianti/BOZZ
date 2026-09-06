import { useState } from 'react'
import { FiDollarSign, FiHome, FiPackage, FiSend, FiSmartphone } from 'react-icons/fi'
import type { PaymentMethod, TransactionType } from '../../api/transactions'
import { formatRupiah } from '../../shell/currency'
import { Button, Card } from '../../shell/design-system'
import type { CartItem } from './types'

export interface PaymentDetails {
  type: TransactionType
  payment_method: PaymentMethod
  amount_paid: number | null
}

interface PaymentPanelProps {
  items: CartItem[]
  subtotal: number
  onBack: () => void
  onConfirm: (details: PaymentDetails) => void
}

const QUICK_AMOUNTS = [0, 5000, 10000, 20000, 50000, 100000]

const TYPE_OPTIONS: { value: TransactionType; label: string; Icon: typeof FiHome }[] = [
  { value: 'walk_in', label: 'Walk-in', Icon: FiHome },
  { value: 'pre_order', label: 'Pre-order', Icon: FiPackage },
]

const METHOD_OPTIONS: { value: PaymentMethod; label: string; Icon: typeof FiDollarSign }[] = [
  { value: 'cash', label: 'Cash', Icon: FiDollarSign },
  { value: 'transfer', label: 'Transfer', Icon: FiSend },
  { value: 'ewallet', label: 'E-wallet', Icon: FiSmartphone },
]

/**
 * Sesuai TransactionCreateRequest (contracts/api.yaml) + validasi
 * checkoutSchema di backend (sales-inventory/routes.ts): amount_paid
 * WAJIB diisi buat cash, dan HARUS kosong buat transfer/ewallet.
 * Validasi ini (canConfirm) TIDAK berubah dari sebelumnya -- yang
 * berubah cuma layout & wording.
 */
export function PaymentPanel({ items, subtotal, onBack, onConfirm }: PaymentPanelProps) {
  const [type, setType] = useState<TransactionType>('walk_in')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [amountPaidInput, setAmountPaidInput] = useState(subtotal)

  const amountPaid = paymentMethod === 'cash' ? amountPaidInput : null
  const change = paymentMethod === 'cash' ? amountPaidInput - subtotal : null
  const isShort = (change ?? 0) < 0
  const canConfirm = paymentMethod !== 'cash' || amountPaidInput >= subtotal

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Detail Pembayaran */}
        <div className="flex flex-col gap-4">
          <Card>
            <p className="mb-2 text-sm font-medium text-slate-700">Jenis transaksi</p>
            <div className="flex gap-2">
              {TYPE_OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    type === value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <p className="mb-2 text-sm font-medium text-slate-700">Metode pembayaran</p>
            <div className="flex gap-2">
              {METHOD_OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(value)
                    if (value === 'cash') setAmountPaidInput(subtotal)
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    paymentMethod === value
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Transfer/E-wallet SENGAJA gak nampilin input cash sama
                sekali (bukan cuma di-disable) -- backend mewajibkan
                amount_paid = null buat dua metode ini, jadi menampilkan
                input yang gak akan dipakai cuma bikin bingung. */}
            {paymentMethod === 'cash' && (
              <div className="mt-4">
                <label htmlFor="amount_paid" className="text-sm font-medium text-slate-700">
                  Uang diterima
                </label>
                <input
                  id="amount_paid"
                  type="number"
                  min={0}
                  value={amountPaidInput}
                  onChange={(event) => setAmountPaidInput(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-lg font-semibold focus:border-brand-500 focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setAmountPaidInput(amount === 0 ? subtotal : subtotal + amount)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      {amount === 0 ? 'Pas' : `+${formatRupiah(amount)}`}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-sm text-slate-600">{isShort ? 'Kurang' : 'Kembalian'}</span>
                  <span className={`text-sm font-semibold ${isShort ? 'text-red-600' : 'text-slate-900'}`}>
                    {formatRupiah(Math.abs(change ?? 0))}
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Ringkasan Belanja -- compact, list detail-nya sendiri yang
            scroll (max-h) kalau item banyak, BUKAN seluruh halaman
            Payment ikut memanjang. */}
        <Card className="flex h-fit flex-col">
          <p className="text-sm font-medium text-slate-700">{items.length} Produk</p>
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto sm:max-h-56">
            {items.map((item) => (
              <li key={item.product.id} className="flex justify-between gap-2 text-sm text-slate-600">
                <span className="truncate">
                  {item.qty}x {item.product.name}
                </span>
                <span className="shrink-0">{formatRupiah(item.product.price * item.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm font-medium text-slate-600">Total</span>
            <span className="text-lg font-bold text-slate-900">{formatRupiah(subtotal)}</span>
          </div>
        </Card>
      </div>

      {/* Sticky relatif ke scroll container terdekat (<main> AppShell,
          scroll behavior AppShell TIDAK diubah) -- selalu keliatan tanpa
          perlu kunci tinggi halaman ke viewport. */}
      <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-slate-50 pt-3">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Kembali
        </Button>
        <Button className="flex-1" disabled={!canConfirm} onClick={() => onConfirm({ type, payment_method: paymentMethod, amount_paid: amountPaid })}>
          Selesaikan Transaksi
        </Button>
      </div>
    </div>
  )
}
