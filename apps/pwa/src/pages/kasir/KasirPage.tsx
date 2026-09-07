import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FiAlertCircle, FiClock, FiWifi, FiWifiOff } from 'react-icons/fi'
import { useOnlineStatus } from '../../shell/offline/connectivity'
import type { CachedProduct } from '../../shell/offline/db'
import { enqueueTransaction } from '../../shell/offline/outbox'
import { getCachedCategories, getCachedProducts, syncProductCache } from '../../shell/offline/productCache'
import { getCachedStoreSettings, syncStoreSettingsCache } from '../../shell/offline/storeSettingsCache'
import { useOutboxStatus } from '../../shell/offline/useOutboxStatus'
import { CartPanel } from './CartPanel'
import { PaymentPanel, type PaymentDetails } from './PaymentPanel'
import { ProductGrid } from './ProductGrid'
import { ReceiptView, type CompletedCheckout } from './ReceiptView'
import type { CartItem } from './types'

type View = 'shopping' | 'payment' | 'receipt'

/**
 * FR-SI-01, FR-SI-06, NFR-01. Halaman paling kritis (SRS) -- semua
 * data produk & checkout lewat cache/antrian lokal (shell/offline),
 * BUKAN fetch/POST langsung, biar tetap responsif <100ms dan gak
 * kehilangan transaksi walau offline (Fase 4).
 */
export function KasirPage() {
  const online = useOnlineStatus()
  const outboxStatus = useOutboxStatus()

  const products = useLiveQuery(() => getCachedProducts(), []) ?? []
  const categories = useLiveQuery(() => getCachedCategories(), []) ?? []
  const storeSettings = useLiveQuery(() => getCachedStoreSettings(), []) ?? null

  const [cart, setCart] = useState<CartItem[]>([])
  const [view, setView] = useState<View>('shopping')
  const [lastCheckout, setLastCheckout] = useState<CompletedCheckout | null>(null)

  // Sync cache pas mount & tiap kali online berubah jadi true (reconnect).
  useEffect(() => {
    if (online) {
      syncProductCache().catch((err: unknown) => {
        console.error('Gagal sync cache produk:', err)
      })
      syncStoreSettingsCache().catch((err: unknown) => {
        console.error('Gagal sync cache profil toko:', err)
      })
    }
  }, [online])

  const cartColumnRef = useRef<HTMLDivElement>(null)
  const [cartHeightPx, setCartHeightPx] = useState<number | null>(null)

  // Tinggi kolom CartPanel (desktop) DIUKUR dari posisi renderan asli --
  // BUKAN dihitung tebak-tebakan dari angka rem header/toolbar AppShell.
  // Ruang di atas CartPanel gak konstan (toolbar status jaringan/sync
  // `flex-wrap` bisa jadi 1 atau 2 baris tergantung badge yang tampil,
  // header AppShell juga gak sebulat angka rem), jadi satu-satunya cara
  // akurat & tahan lama adalah baca `getBoundingClientRect()` beneran,
  // bukan nebak dari kelas Tailwind. Diukur ulang tiap resize + tiap
  // konten toolbar berpotensi berubah tinggi (online/pending/failed).
  useLayoutEffect(() => {
    function recalc() {
      const el = cartColumnRef.current
      const isDesktop = window.innerWidth >= 768 // breakpoint `md:` Tailwind
      if (!el || !isDesktop) {
        setCartHeightPx(null) // mobile -- CartPanel gak sticky/dibatasi, biarin alur normal.
        return
      }
      const BOTTOM_MARGIN_PX = 16 // 1rem, konsisten sama sticky `top-4` di atasnya.
      setCartHeightPx(Math.max(window.innerHeight - el.getBoundingClientRect().top - BOTTOM_MARGIN_PX, 0))
    }
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [view, online, outboxStatus.pendingCount, outboxStatus.failedCount])

  function addToCart(product: CachedProduct) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) => (item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item))
      }
      return [...prev, { product, qty: 1 }]
    })
  }

  function incrementQty(productId: string) {
    setCart((prev) => prev.map((item) => (item.product.id === productId ? { ...item, qty: item.qty + 1 } : item)))
  }

  function decrementQty(productId: string) {
    setCart((prev) =>
      prev
        .map((item) => (item.product.id === productId ? { ...item, qty: item.qty - 1 } : item))
        .filter((item) => item.qty > 0),
    )
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  async function handleConfirmPayment(details: PaymentDetails) {
    const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0)

    const idempotencyKey = await enqueueTransaction({
      type: details.type,
      payment_method: details.payment_method,
      amount_paid: details.amount_paid,
      items: cart.map((item) => ({ product_id: item.product.id, qty: item.qty })),
    })

    setLastCheckout({
      idempotencyKey,
      type: details.type,
      paymentMethod: details.payment_method,
      amountPaid: details.amount_paid,
      items: cart,
      subtotal,
      createdAt: new Date().toISOString(),
    })
    setCart([])
    setView('receipt')
  }

  function handleNewTransaction() {
    setLastCheckout(null)
    setView('shopping')
  }

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0)

  return (
    // Normal block flow -- halaman ini TIDAK dikunci ke tinggi viewport
    // (AppShell.tsx TIDAK disentuh, <main>-nya tetap scroll seperti
    // semula). Fixed/sticky behavior yang dibutuhkan Kasir (CartPanel
    // tetap keliatan, action bar Payment gak ketutup scroll) diselesaikan
    // lokal di sini pakai `sticky` relatif ke <main> yang scroll, BUKAN
    // dengan mengunci h-full/overflow-hidden ke seluruh halaman. Judul
    // "Kasir" (h1) DIHAPUS -- redundan sama top header AppShell yang
    // udah nampilin nama menu aktif; toolbar status jaringan/sync tetap
    // ada.
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            online ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {online ? <FiWifi aria-hidden="true" className="h-3.5 w-3.5" /> : <FiWifiOff aria-hidden="true" className="h-3.5 w-3.5" />}
          {online ? 'Online' : 'Offline -- transaksi tetap kesimpen'}
        </span>
        {outboxStatus.pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            <FiClock aria-hidden="true" className="h-3.5 w-3.5" />
            {outboxStatus.pendingCount} transaksi belum tersinkron
          </span>
        )}
        {outboxStatus.failedCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            <FiAlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
            {outboxStatus.failedCount} transaksi gagal, cek lagi nanti
          </span>
        )}
      </div>

      {view === 'shopping' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px] md:items-start">
          <ProductGrid products={products} categories={categories} onAdd={addToCart} />
          {/* Desktop: tinggi panel ini DIUKUR (cartHeightPx, lihat
              useLayoutEffect di atas) dari posisi renderan asli -- BUKAN
              calc(100svh-Xrem) yang nebak tinggi header/toolbar AppShell.
              Ruang di atas panel ini gak konstan (toolbar status
              online/pending/failed pakai flex-wrap, bisa 1 atau 2 baris),
              jadi cuma pengukuran nyata yang akurat & tahan perubahan
              konten toolbar/header di masa depan. Karena tingginya PASTI
              (bukan auto-sampai-cap), isi flex-1 min-h-0 overflow-y-auto
              di CartPanel (ul daftar item) bakal ngisi ruang kosong kalau
              item dikit, dan baru scroll kalau kepanjangan -- header
              "Keranjang" & footer Subtotal/Bayar (shrink-0 di CartPanel)
              SELALU keliatan tanpa perlu discroll halaman. `md:items-start`
              di grid di atas WAJIB ada -- tanpa itu grid nyeret ProductGrid
              ikut stretch/dibatasi tinggi panel ini juga. Mobile: TIDAK
              sticky & TIDAK dikasih tinggi tetap sama sekali (cartHeightPx
              null di bawah md) -- alur normal, ikut scroll halaman kayak
              biasa (gak ada nested/fixed scroll di mobile). */}
          <div
            ref={cartColumnRef}
            style={cartHeightPx !== null ? { height: `${cartHeightPx}px` } : undefined}
            className="flex flex-col border-t border-slate-200 pt-3 md:sticky md:top-4 md:border-l md:border-t-0 md:pl-4 md:pt-0"
          >
            <CartPanel
              items={cart}
              onIncrement={incrementQty}
              onDecrement={decrementQty}
              onRemove={removeFromCart}
              onCheckout={() => setView('payment')}
            />
          </div>
        </div>
      )}

      {view === 'payment' && (
        <PaymentPanel items={cart} subtotal={subtotal} onBack={() => setView('shopping')} onConfirm={handleConfirmPayment} />
      )}

      {view === 'receipt' && lastCheckout && (
        <ReceiptView checkout={lastCheckout} storeSettings={storeSettings} onNewTransaction={handleNewTransaction} />
      )}
    </div>
  )
}
