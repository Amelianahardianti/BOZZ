import type { PaymentMethod, TransactionType } from '../../api/transactions'
import { formatRupiah } from '../../shell/currency'
import { Button, Card } from '../../shell/design-system'
import type { CartItem } from './types'

export interface CompletedCheckout {
  idempotencyKey: string
  type: TransactionType
  paymentMethod: PaymentMethod
  amountPaid: number | null
  items: CartItem[]
  subtotal: number
  createdAt: string
}

interface ReceiptViewProps {
  checkout: CompletedCheckout
  onNewTransaction: () => void
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  ewallet: 'E-wallet',
}

/**
 * Struk sederhana (FR-SI-05, versi awal) -- datanya dari input kasir
 * sendiri (bukan nunggu response server), makanya bisa langsung
 * tampil <2 detik walau offline (acceptance criteria POS Checkout).
 * Styling struk termal/gambar detail nyusul Fase 10.
 */
export function ReceiptView({ checkout, onNewTransaction }: ReceiptViewProps) {
  const change = checkout.amountPaid !== null ? checkout.amountPaid - checkout.subtotal : null

  return (
    <div className="mx-auto flex h-full max-w-md flex-col gap-4">
      <Card>
        <div className="mb-3 text-center">
          <p className="text-sm font-semibold text-green-700">Transaksi Berhasil</p>
          <p className="text-xs text-slate-400">
            {new Date(checkout.createdAt).toLocaleString('id-ID')} -- {checkout.idempotencyKey.slice(0, 8)}
          </p>
        </div>

        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {checkout.items.map((item) => (
            <li key={item.product.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-700">
                {item.product.name} <span className="text-slate-400">x{item.qty}</span>
              </span>
              <span className="font-medium text-slate-900">{formatRupiah(item.product.price * item.qty)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Jenis</span>
            <span>{checkout.type === 'walk_in' ? 'Walk-in' : 'Pre-order'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Metode bayar</span>
            <span>{PAYMENT_LABEL[checkout.paymentMethod]}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-900">
            <span>Total</span>
            <span>{formatRupiah(checkout.subtotal)}</span>
          </div>
          {checkout.amountPaid !== null && (
            <>
              <div className="flex justify-between">
                <span className="text-slate-500">Uang diterima</span>
                <span>{formatRupiah(checkout.amountPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Kembalian</span>
                <span>{formatRupiah(change ?? 0)}</span>
              </div>
            </>
          )}
        </div>
      </Card>

      <div className="flex gap-2 print:hidden">
        <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
          Cetak Struk
        </Button>
        <Button className="flex-1" onClick={onNewTransaction}>
          Transaksi Baru
        </Button>
      </div>
    </div>
  )
}
