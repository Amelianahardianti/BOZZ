import { useLayoutEffect, useRef, useState } from 'react'
import { FiCheckCircle, FiPrinter, FiRefreshCw } from 'react-icons/fi'
import type { StoreSettings } from '../../api/storeSettings'
import type { PaymentMethod, TransactionType } from '../../api/transactions'
import { formatRupiah } from '../../shell/currency'
import { Button } from '../../shell/design-system'
import { useOnlineStatus } from '../../shell/offline/connectivity'
import { useTransactionSyncStatus, type TransactionSyncStatus } from '../../shell/offline/useOutboxStatus'
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
  /** null kalau cache profil toko belum pernah ke-sync (mis. baru install PWA, langsung offline) -- header struk pakai fallback generik. */
  storeSettings: Pick<StoreSettings, 'business_name' | 'address' | 'phone' | 'logo_url' | 'receipt_footer_note'> | null
  onNewTransaction: () => void
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  ewallet: 'E-wallet',
}

/**
 * Wording status sync -- TIDAK overclaim. "checking" cuma sesaat
 * (baru dipasang, belum sempat baca outbox), gak ditampilkan sebagai
 * kalimat apapun (biar gak ada flash teks yang langsung ganti).
 */
function syncStatusMessage(status: TransactionSyncStatus, online: boolean): string {
  switch (status) {
    case 'checking':
      return ''
    case 'synced':
      return 'Transaksi tersinkron ke server.'
    case 'failed':
      return 'Tersimpan di perangkat -- sinkronisasi gagal, akan dicoba lagi otomatis.'
    case 'pending':
    case 'syncing':
    default:
      return online
        ? 'Tersimpan di perangkat, menunggu sinkronisasi...'
        : 'Tersimpan di perangkat, akan disinkronkan otomatis saat online.'
  }
}

/**
 * Struk (FR-SI-05) -- datanya dari input kasir sendiri (bukan nunggu
 * response server), makanya bisa langsung tampil <2 detik walau
 * offline (acceptance criteria POS Checkout). Header pakai profil
 * toko (nama/alamat/telepon/logo dari Pengaturan Toko) yang dibaca
 * dari cache lokal (shell/offline/storeSettingsCache.ts) -- sama-sama
 * instan & offline-safe, gak nunggu jaringan kayak data produk.
 *
 * Layout desktop (lg:) dua kolom -- kiri "Transaction Summary" (status
 * sukses + status sync + total + aksi), kanan "Receipt Preview" (blok
 * 58mm). Mobile: satu kolom, urutan sesuai JSX (summary -> aksi ->
 * receipt), TANPA scroll internal -- ikut page scroll biasa.
 *
 * SCREEN vs PRINT dipisah TANPA duplikasi markup: blok 58mm di bawah
 * ini SATU-SATUNYA sumber, tampil di dua-duanya (di layar sebagai
 * "preview" ukuran aslinya di dalam kolom kanan, pas print itu juga
 * yang keluar dari printer). Wrapper scroll+background kolom kanan
 * pakai `print:contents` -- box-nya "hilang" pas print (gak ikut
 * kecetak border/bg/scroll-nya), blok 58mm di dalamnya mengalir apa
 * adanya, persis kayak sebelum kolom kanan ini ada.
 *
 * Lebar `w-[58mm]` SENGAJA dipakai baik di layar maupun pas print --
 * unit mm dikonversi browser secara konsisten di dua-duanya, jadi apa
 * yang kelihatan di layar itu literally ukuran fisik yang bakal
 * dicetak (WYSIWYG), bukan cuma preview kira-kira. Ukuran kertas
 * beneran (58mm, tanpa margin) diatur lewat @page di index.css --
 * itu satu-satunya cara ngatur ukuran halaman print, gak bisa lewat
 * className.
 */
export function ReceiptView({ checkout, storeSettings, onNewTransaction }: ReceiptViewProps) {
  const online = useOnlineStatus()
  const syncStatus = useTransactionSyncStatus(checkout.idempotencyKey)
  const change = checkout.amountPaid !== null ? checkout.amountPaid - checkout.subtotal : null

  const receiptColumnRef = useRef<HTMLDivElement>(null)
  const [receiptHeightPx, setReceiptHeightPx] = useState<number | null>(null)

  // Tinggi kolom kanan (desktop) DIUKUR dari posisi renderan asli --
  // BUKAN calc(100svh-Xrem) tebakan (pola yang sama & sudah terbukti
  // dipakai buat CartPanel, lihat KasirPage.tsx). Ini HANYA menambah
  // overflow-y-auto LOKAL di wrapper ini -- page scroll `<main>`
  // AppShell TIDAK pernah dikunci/dimatikan; kalau kolom kiri sendiri
  // suatu saat lebih tinggi dari viewport, halaman tetap bisa discroll
  // normal seperti biasa.
  useLayoutEffect(() => {
    function recalc() {
      const el = receiptColumnRef.current
      const isDesktop = window.innerWidth >= 1024 // breakpoint `lg:` -- konsisten sama grid 2 kolom di bawah
      if (!el || !isDesktop) {
        setReceiptHeightPx(null) // mobile -- receipt gak dibatasi tinggi, ikut alur & scroll halaman biasa.
        return
      }
      const BOTTOM_MARGIN_PX = 16 // 1rem, jarak napas ke bawah viewport.
      setReceiptHeightPx(Math.max(window.innerHeight - el.getBoundingClientRect().top - BOTTOM_MARGIN_PX, 0))
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] print:block">
      {/* Kolom kiri -- Transaction Summary & Actions. TIDAK sticky/
          dibatasi tinggi -- normal flow, karena kolom kanan yang
          dibatasi (di bawah) sudah menjamin kasus umum muat satu
          viewport tanpa perlu halaman discroll sama sekali. */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1 text-center print:hidden lg:items-start lg:text-left">
          <FiCheckCircle aria-hidden="true" className="h-10 w-10 text-green-600" />
          <p className="text-lg font-bold text-slate-900">Transaksi Berhasil Dicatat</p>
          {syncStatusMessage(syncStatus, online) && (
            <p className="max-w-xs text-sm text-slate-500">{syncStatusMessage(syncStatus, online)}</p>
          )}
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatRupiah(checkout.subtotal)}</p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2 self-center print:hidden lg:max-w-none lg:self-auto">
          <Button variant="secondary" onClick={() => window.print()}>
            <FiPrinter aria-hidden="true" className="h-4 w-4" />
            Cetak Struk
          </Button>
          <Button onClick={onNewTransaction}>
            <FiRefreshCw aria-hidden="true" className="h-4 w-4" />
            Transaksi Baru
          </Button>
        </div>
      </div>

      {/* Kolom kanan -- Receipt Preview */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 print:hidden">Preview Struk</p>

        <div
          ref={receiptColumnRef}
          style={receiptHeightPx !== null ? { height: `${receiptHeightPx}px` } : undefined}
          className="flex justify-center overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 print:contents"
        >
          <div className="w-[58mm] bg-white p-2 font-mono text-[11px] leading-tight text-black shadow-sm print:p-1 print:shadow-none">
            <div className="mb-2 text-center">
              {storeSettings?.logo_url && (
                <img src={storeSettings.logo_url} alt="Logo toko" className="mx-auto mb-1 h-12 w-12 object-contain" />
              )}
              <p className="font-bold">{storeSettings?.business_name || 'Toko'}</p>
              {storeSettings?.address && <p>{storeSettings.address}</p>}
              {storeSettings?.phone && <p>{storeSettings.phone}</p>}
            </div>

            <div className="border-t border-dashed border-black" />

            <div className="my-1.5 text-center">
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
              <p>{storeSettings?.receipt_footer_note || 'Terima kasih!'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
