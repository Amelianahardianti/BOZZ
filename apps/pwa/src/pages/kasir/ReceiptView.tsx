import type { PaymentMethod, TransactionType } from '../../api/transactions'
import { formatRupiah } from '../../shell/currency'
import { Button } from '../../shell/design-system'
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
 * Styling struk lengkap (logo toko dari store-settings, dll) nyusul
 * Fase 10.
 *
 * Lebar `w-[58mm]` SENGAJA dipakai baik di layar maupun pas print --
 * unit mm dikonversi browser secara konsisten di dua-duanya, jadi apa
 * yang kelihatan di layar itu literally ukuran fisik yang bakal
 * dicetak (WYSIWYG), bukan cuma preview kira-kira. Ukuran kertas
 * beneran (58mm, tanpa margin) diatur lewat @page di index.css --
 * itu satu-satunya cara ngatur ukuran halaman print, gak bisa lewat
 * className.
 */
export function ReceiptView({ checkout, onNewTransaction }: ReceiptViewProps) {
  const change = checkout.amountPaid !== null ? checkout.amountPaid - checkout.subtotal : null

  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-y-auto py-2">
      <div className="w-[58mm] bg-white p-2 font-mono text-[11px] leading-tight text-black print:p-1">
        <div className="mb-2 text-center">
          <p className="font-bold">Transaksi Berhasil</p>
          <p>{new Date(checkout.createdAt).toLocaleString('id-ID')}</p>
          <p>#{checkout.idempotencyKey.slice(0, 8)}</p>
        </div>

        <div className="border-t border-dashed border-black" />

        <ul className="my-1.5">
          {checkout.items.map((item) => (
            <li key={item.product.id} className="py-1">
              <p>{item.product.name}</p>
              <p className="flex justify-between">
                <span>
                  {item.qty} x {formatRupiah(item.product.price)}
                </span>
                <span>{formatRupiah(item.product.price * item.qty)}</span>
              </p>
            </li>
          ))}
        </ul>

        <div className="border-t border-dashed border-black" />

        <div className="mt-1.5 space-y-0.5">
          <p className="flex justify-between">
            <span>Jenis</span>
            <span>{checkout.type === 'walk_in' ? 'Walk-in' : 'Pre-order'}</span>
          </p>
          <p className="flex justify-between">
            <span>Bayar</span>
            <span>{PAYMENT_LABEL[checkout.paymentMethod]}</span>
          </p>
          <p className="flex justify-between font-bold">
            <span>Total</span>
            <span>{formatRupiah(checkout.subtotal)}</span>
          </p>
          {checkout.amountPaid !== null && (
            <>
              <p className="flex justify-between">
                <span>Diterima</span>
                <span>{formatRupiah(checkout.amountPaid)}</span>
              </p>
              <p className="flex justify-between">
                <span>Kembali</span>
                <span>{formatRupiah(change ?? 0)}</span>
              </p>
            </>
          )}
        </div>

        <div className="mt-2 border-t border-dashed border-black pt-1.5 text-center">
          <p>Terima kasih!</p>
        </div>
      </div>

      <div className="flex w-[58mm] flex-col gap-2 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          Cetak Struk
        </Button>
        <Button onClick={onNewTransaction}>Transaksi Baru</Button>
      </div>
    </div>
  )
}
