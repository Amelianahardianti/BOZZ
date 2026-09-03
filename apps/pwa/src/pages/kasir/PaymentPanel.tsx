import { useState } from 'react'
import type { PaymentMethod, TransactionType } from '../../api/transactions'
import { formatRupiah } from '../../shell/currency'
import { Button, Card } from '../../shell/design-system'

export interface PaymentDetails {
  type: TransactionType
  payment_method: PaymentMethod
  amount_paid: number | null
}

interface PaymentPanelProps {
  subtotal: number
  onBack: () => void
  onConfirm: (details: PaymentDetails) => void
}

const QUICK_AMOUNTS = [0, 5000, 10000, 20000, 50000, 100000]

/**
 * Sesuai TransactionCreateRequest (contracts/api.yaml) + validasi
 * checkoutSchema di backend (sales-inventory/routes.ts): amount_paid
 * WAJIB diisi buat cash, dan HARUS kosong buat transfer/ewallet.
 */
export function PaymentPanel({ subtotal, onBack, onConfirm }: PaymentPanelProps) {
  const [type, setType] = useState<TransactionType>('walk_in')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [amountPaidInput, setAmountPaidInput] = useState(subtotal)

  const amountPaid = paymentMethod === 'cash' ? amountPaidInput : null
  const change = paymentMethod === 'cash' ? amountPaidInput - subtotal : null
  const canConfirm = paymentMethod !== 'cash' || amountPaidInput >= subtotal

  return (
    <div className="mx-auto flex h-full max-w-md flex-col gap-4">
      <Card>
        <p className="text-sm font-medium text-slate-600">Total belanja</p>
        <p className="text-2xl font-bold text-slate-900">{formatRupiah(subtotal)}</p>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-700">Jenis transaksi</p>
        <div className="flex gap-2">
          {(['walk_in', 'pre_order'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                type === value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'
              }`}
            >
              {value === 'walk_in' ? 'Walk-in' : 'Pre-order'}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-slate-700">Metode pembayaran</p>
        <div className="flex gap-2">
          {(['cash', 'transfer', 'ewallet'] as const).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => {
                setPaymentMethod(method)
                if (method === 'cash') setAmountPaidInput(subtotal)
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize ${
                paymentMethod === method
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              {method === 'ewallet' ? 'E-wallet' : method}
            </button>
          ))}
        </div>

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
              <span className="text-sm text-slate-600">Kembalian</span>
              <span className={`text-sm font-semibold ${(change ?? 0) < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {formatRupiah(Math.max(0, change ?? 0))}
              </span>
            </div>
            {(change ?? 0) < 0 && (
              <p className="mt-1 text-xs text-red-600">Uang yang diterima kurang dari total belanja.</p>
            )}
          </div>
        )}
      </Card>

      <div className="mt-auto flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Kembali
        </Button>
        <Button
          className="flex-1"
          disabled={!canConfirm}
          onClick={() => onConfirm({ type, payment_method: paymentMethod, amount_paid: amountPaid })}
        >
          Selesaikan Transaksi
        </Button>
      </div>
    </div>
  )
}
