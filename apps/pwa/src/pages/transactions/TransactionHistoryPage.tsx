import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { fetchTransaction, fetchTransactions, type PaymentMethod, type Transaction } from '../../api/transactions'
import { ApiRequestError } from '../../api/client'
import { getCachedStoreSettings } from '../../shell/offline/storeSettingsCache'
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatusBadge } from '../../shell/design-system'
import { formatRupiah } from '../../shell/currency'
import { ReceiptView, type CompletedCheckout } from '../kasir/ReceiptView'

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  transfer: 'Transfer',
  ewallet: 'E-wallet',
}

const PAGE_SIZE = 10

/**
 * ReceiptView cuma butuh {product: {name, price}, qty} per item (bukan
 * CachedProduct penuh) -- transaksi tersimpan sudah punya snapshot harga
 * & nama saat transaksi terjadi, jadi struk lama tetap sama walau harga
 * produk sekarang sudah berubah (lihat komentar GET /transactions/:id
 * di backend routes.ts).
 */
function transactionToCheckout(transaction: Transaction): CompletedCheckout {
  return {
    idempotencyKey: transaction.idempotency_key,
    type: transaction.type,
    paymentMethod: transaction.payment_method,
    amountPaid: transaction.amount_paid,
    subtotal: transaction.total_amount,
    createdAt: transaction.created_at,
    items: transaction.items.map((item) => ({
      // ReceiptView cuma baca product.name & product.price, jadi shape
      // minimal ini aman dipakai walau bukan CachedProduct sungguhan --
      // as unknown as ... SENGAJA dipakai karena field CachedProduct
      // lainnya (stok, kategori, dst) gak relevan buat struk.
      product: { id: item.product_id, name: item.product_name_snapshot, price: item.unit_price } as unknown as CompletedCheckout['items'][number]['product'],
      qty: item.qty,
    })),
  }
}

export function TransactionHistoryPage() {
  const storeSettings = useLiveQuery(() => getCachedStoreSettings(), []) ?? null

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null)
  const [isOpeningReceipt, setIsOpeningReceipt] = useState<string | null>(null)

  useEffect(() => {
    Promise.resolve()
      .then(() => {
        setIsLoading(true)
        setLoadError(null)
        return fetchTransactions({ page, limit: PAGE_SIZE })
      })
      .then((result) => {
        setTransactions(result.data)
        setTotal(result.total)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat riwayat transaksi.')
      })
      .finally(() => setIsLoading(false))
  }, [page])

  async function openReceipt(id: string) {
    setIsOpeningReceipt(id)
    try {
      const transaction = await fetchTransaction(id)
      setViewingTransaction(transaction)
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal membuka struk.')
    } finally {
      setIsOpeningReceipt(null)
    }
  }

  if (viewingTransaction) {
    return (
      <>
        <PageHeader title="Struk Transaksi" />
        <ReceiptView
          checkout={transactionToCheckout(viewingTransaction)}
          storeSettings={storeSettings}
          onNewTransaction={() => setViewingTransaction(null)}
        />
      </>
    )
  }

  const hasNextPage = page * PAGE_SIZE < total

  return (
    <>
      <PageHeader title="Riwayat Transaksi" description="Daftar transaksi POS, buka ulang struknya buat dicetak lagi." />

      {isLoading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState description={loadError} />
      ) : transactions.length === 0 ? (
        <EmptyState title="Belum ada transaksi" description="Transaksi POS yang sudah selesai akan muncul di sini." />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 font-medium">Waktu</th>
                <th className="pb-2 font-medium">Jenis</th>
                <th className="pb-2 font-medium">Pembayaran</th>
                <th className="pb-2 font-medium">Total</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">{new Date(transaction.created_at).toLocaleString('id-ID')}</td>
                  <td className="py-2">{transaction.type === 'walk_in' ? 'Walk-in' : 'Pre-order'}</td>
                  <td className="py-2">{PAYMENT_LABEL[transaction.payment_method]}</td>
                  <td className="py-2 font-medium text-slate-900">{formatRupiah(transaction.total_amount)}</td>
                  <td className="py-2">
                    <StatusBadge
                      label={transaction.status === 'completed' ? 'Selesai' : 'Dibatalkan'}
                      tone={transaction.status === 'completed' ? 'success' : 'neutral'}
                    />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-brand-600 hover:underline disabled:opacity-50"
                      disabled={isOpeningReceipt === transaction.id}
                      onClick={() => openReceipt(transaction.id)}
                    >
                      Lihat/Cetak Struk
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!isLoading && !loadError && (transactions.length > 0 || page > 1) && (
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          hasNextPage={hasNextPage}
          onPrevious={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </>
  )
}
