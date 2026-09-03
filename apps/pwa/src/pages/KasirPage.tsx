import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useOnlineStatus } from '../shell/offline/connectivity'
import type { CachedProduct } from '../shell/offline/db'
import { enqueueTransaction } from '../shell/offline/outbox'
import { getCachedCategories, getCachedProducts, syncProductCache } from '../shell/offline/productCache'
import { useOutboxStatus } from '../shell/offline/useOutboxStatus'
import { CartPanel } from './kasir/CartPanel'
import { PaymentPanel, type PaymentDetails } from './kasir/PaymentPanel'
import { ProductGrid } from './kasir/ProductGrid'
import { ReceiptView, type CompletedCheckout } from './kasir/ReceiptView'
import type { CartItem } from './kasir/types'

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

  const [cart, setCart] = useState<CartItem[]>([])
  const [view, setView] = useState<View>('shopping')
  const [lastCheckout, setLastCheckout] = useState<CompletedCheckout | null>(null)

  // Sync cache pas mount & tiap kali online berubah jadi true (reconnect).
  useEffect(() => {
    if (online) {
      syncProductCache().catch((err: unknown) => {
        console.error('Gagal sync cache produk:', err)
      })
    }
  }, [online])

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
    <div className="flex h-[calc(100svh-8rem)] flex-col md:h-[calc(100svh-3rem)]">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <h1 className="mr-1 text-sm font-semibold text-slate-900">Kasir</h1>
        <span className={`rounded-full px-2 py-0.5 font-medium ${online ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {online ? 'Online' : 'Offline -- transaksi tetap kesimpen'}
        </span>
        {outboxStatus.pendingCount > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {outboxStatus.pendingCount} transaksi belum tersinkron
          </span>
        )}
        {outboxStatus.failedCount > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
            {outboxStatus.failedCount} transaksi gagal, cek lagi nanti
          </span>
        )}
      </div>

      {view === 'shopping' && (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[1fr_320px]">
          <ProductGrid products={products} categories={categories} onAdd={addToCart} />
          <div className="border-t border-slate-200 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
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
        <PaymentPanel subtotal={subtotal} onBack={() => setView('shopping')} onConfirm={handleConfirmPayment} />
      )}

      {view === 'receipt' && lastCheckout && (
        <ReceiptView checkout={lastCheckout} onNewTransaction={handleNewTransaction} />
      )}
    </div>
  )
}
