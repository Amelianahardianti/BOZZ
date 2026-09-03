import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button, Card, PageHeader } from '../../shell/design-system'
import { useOnlineStatus } from '../../shell/offline/connectivity'
import { db } from '../../shell/offline/db'
import { enqueueTransaction, syncOutbox } from '../../shell/offline/outbox'
import { getCachedProducts, syncProductCache } from '../../shell/offline/productCache'
import { useOutboxStatus } from '../../shell/offline/useOutboxStatus'

/**
 * HALAMAN DEV-ONLY -- bukan bagian dari SRS, cuma buat manual-test
 * Offline-Sync Engine (Fase 4) sebelum Kasir Page (Fase 5) beneran
 * ada. HAPUS file ini (+ rute-nya di router.tsx) begitu Kasir Page
 * udah bisa manggil enqueueTransaction() sendiri.
 *
 * Cara pakai: login dulu lewat /login (biar ada sesi), baru buka
 * /dev/offline-sync-test. Buat simulasi offline: DevTools -> Network
 * -> Throttling -> Offline (BUKAN matiin WiFi -- request ke localhost
 * gak lewat kartu jaringan, jadi WiFi mati gak ngefek ke localhost).
 */
export function OfflineSyncTestPage() {
  const online = useOnlineStatus()
  const outboxStatus = useOutboxStatus()
  const outboxEntries = useLiveQuery(() => db.outboxTransactions.toArray(), []) ?? []
  const cachedProducts = useLiveQuery(() => getCachedProducts(), []) ?? []

  const [productId, setProductId] = useState('seed-product-1')
  const [qty, setQty] = useState(1)
  const [amountPaid, setAmountPaid] = useState(20000)
  const [log, setLog] = useState<string[]>([])

  function pushLog(message: string) {
    setLog((prev) => [`${new Date().toLocaleTimeString()} -- ${message}`, ...prev].slice(0, 20))
  }

  async function handleCheckout() {
    try {
      const idempotencyKey = await enqueueTransaction({
        type: 'walk_in',
        payment_method: 'cash',
        amount_paid: amountPaid,
        items: [{ product_id: productId, qty }],
      })
      pushLog(`Checkout di-antre, idempotencyKey=${idempotencyKey.slice(0, 8)}...`)
    } catch (err) {
      pushLog(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleManualSync() {
    pushLog('syncOutbox() dipanggil manual...')
    await syncOutbox()
    pushLog('syncOutbox() selesai.')
  }

  async function handleSyncProducts() {
    pushLog('syncProductCache() dipanggil...')
    try {
      await syncProductCache()
      pushLog('syncProductCache() selesai.')
    } catch (err) {
      pushLog(`Error sync produk: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="min-h-svh bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-800">
          Halaman dev-only. Bukan bagian SRS -- HAPUS setelah Kasir Page (Fase 5) jadi.
        </div>

        <PageHeader
          title="Test Offline-Sync Engine"
          description={`Status koneksi browser: ${online ? '🟢 Online' : '🔴 Offline'}`}
        />

        <Card className="mb-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">1. Simulasi Checkout</h2>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              product_id
              <input
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              qty
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(event) => setQty(Number(event.target.value))}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-600">
              amount_paid
              <input
                type="number"
                value={amountPaid}
                onChange={(event) => setAmountPaid(Number(event.target.value))}
                className="rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={handleCheckout}>Checkout (enqueueTransaction)</Button>
            <Button variant="secondary" onClick={handleManualSync}>
              Sync Manual (syncOutbox)
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Coba: DevTools → Network → Throttling → Offline, klik Checkout beberapa kali (baris di bawah
            tetap "pending"). Balikin throttling ke "No throttling", lalu klik Sync Manual (atau tunggu
            auto-sync tiap 30 detik) -- baris hilang berarti berhasil terkirim ke backend.
          </p>
        </Card>

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">
            2. Status Outbox ({outboxStatus.pendingCount} pending, {outboxStatus.failedCount} failed)
          </h2>
          {outboxEntries.length === 0 ? (
            <p className="text-sm text-slate-400">Kosong.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="pb-1">id</th>
                  <th className="pb-1">status</th>
                  <th className="pb-1">attempts</th>
                  <th className="pb-1">lastError</th>
                </tr>
              </thead>
              <tbody>
                {outboxEntries.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100">
                    <td className="py-1 font-mono">{entry.id.slice(0, 8)}...</td>
                    <td className="py-1">{entry.status}</td>
                    <td className="py-1">{entry.attempts}</td>
                    <td className="py-1 text-red-600">{entry.lastError ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">3. Cache Produk ({cachedProducts.length} produk)</h2>
          <Button variant="secondary" onClick={handleSyncProducts}>
            Sync Produk dari Server
          </Button>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
            {cachedProducts.map((product) => (
              <li key={product.id}>
                {product.name} -- stok {product.stock_qty} -- Rp{product.price}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">4. Log</h2>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
            {log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
