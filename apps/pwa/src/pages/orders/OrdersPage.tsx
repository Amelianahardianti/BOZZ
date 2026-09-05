import { useEffect, useState } from 'react'
import {
  fetchOrderDetail,
  fetchOrders,
  updateOrderStatus,
  type ExternalOrderStatus,
  type OrderDetail,
  type SlaType,
} from '../../api/orders'
import { fetchPlatforms, type Platform } from '../../api/platforms'
import { ApiRequestError } from '../../api/client'
import { Button, Card, EmptyState, PageHeader } from '../../shell/design-system'
import { formatRupiah } from '../../shell/currency'

const STATUS_LABEL: Record<ExternalOrderStatus, string> = {
  new: 'Baru',
  processing: 'Diproses',
  shipped: 'Dikirim',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
}

const STATUS_BADGE: Record<ExternalOrderStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  processing: 'bg-amber-100 text-amber-700',
  shipped: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

const SLA_LABEL: Record<SlaType, string> = {
  instant: 'Instant',
  same_day: 'Same Day',
  reguler: 'Reguler',
}

type Filters = {
  platform_id: string
  status: ExternalOrderStatus | ''
  sla_type: SlaType | ''
}

const EMPTY_FILTERS: Filters = { platform_id: '', status: '', sla_type: '' }

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

// Order dianggap kelewat SLA cuma kalau statusnya masih aktif -- yang
// udah selesai/batal gak perlu ditandai lewat lagi, kejar-kejaran waktu
// itu udah gak relevan buat mereka.
function isOverdue(order: OrderDetail): boolean {
  if (!order.sla_deadline) return false
  return new Date(order.sla_deadline) < new Date() && order.status !== 'completed' && order.status !== 'cancelled'
}

export function OrdersPage() {
  const [orders, setOrders] = useState<OrderDetail[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)
  // Backend GET /orders balikin array polos (gak ada `total`), jadi
  // "ada halaman berikutnya apa nggak" ditebak dari jumlah hasil: kalau
  // pas ngembaliin sejumlah pageSize, KEMUNGKINAN masih ada lagi.
  const [hasNextPage, setHasNextPage] = useState(false)

  const platformName = (platformId: string) => platforms.find((p) => p.id === platformId)?.platform_name ?? platformId

  function updateFilters(changes: Partial<Filters>) {
    setFilters({ ...filters, ...changes })
    setPage(1)
  }

  function updatePageSize(newPageSize: PageSize) {
    setPageSize(newPageSize)
    setPage(1)
  }

  // SATU chain promise, termasuk reset isLoading/loadError-nya lewat
  // .then() (bukan dipanggil sinkron di badan efek) -- biar gak kena
  // react-hooks/set-state-in-effect, sama pola-nya kayak
  // NotificationsPage.tsx. Efek ini jalan ulang tiap filter/halaman/
  // ukuran halaman ganti.
  //
  // GET /orders (list) SENGAJA gak nyertain item per order (SRS 10.5,
  // biar ringan) -- karena tampilan sekarang butuh item-nya langsung
  // kelihatan di tiap kartu (bukan diklik dulu), detail tiap order
  // (yang ada item-nya) ikut ditarik sekalian lewat Promise.all. Dengan
  // pagination, jumlah request paralel ini kebatasin ke pageSize (maks
  // 50), gak lagi ratusan sekaligus kayak sebelum ada pagination.
  useEffect(() => {
    Promise.resolve()
      .then(() => {
        setIsLoading(true)
        setLoadError(null)
        return Promise.all([
          fetchOrders({
            platform_id: filters.platform_id || undefined,
            status: filters.status || undefined,
            sla_type: filters.sla_type || undefined,
            page,
            limit: pageSize,
          }),
          fetchPlatforms(),
        ])
      })
      .then(async ([orderList, platformList]) => {
        setPlatforms(platformList)
        setHasNextPage(orderList.length === pageSize)
        const details = await Promise.all(orderList.map((order) => fetchOrderDetail(order.id)))
        setOrders(details)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat daftar order.')
      })
      .finally(() => setIsLoading(false))
  }, [filters, page, pageSize])

  async function handleUpdateStatus(orderId: string, newStatus: ExternalOrderStatus) {
    setUpdatingOrderId(orderId)
    try {
      const updated = await updateOrderStatus(orderId, newStatus)
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: updated.status } : o)))
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal mengubah status order.')
    } finally {
      setUpdatingOrderId(null)
    }
  }

  return (
    <>
      <PageHeader title="Pesanan Masuk" description="Daftar order marketplace, filter platform/status/SLA (FR-OC-05)." />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="platform-filter" className="text-sm font-medium text-slate-700">
              Platform
            </label>
            <select
              id="platform-filter"
              value={filters.platform_id}
              onChange={(event) => updateFilters({ platform_id: event.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">Semua Platform</option>
              {platforms
                .filter((p) => p.id)
                .map((p) => (
                  <option key={p.platform_name} value={p.id ?? ''}>
                    {p.platform_name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="status-filter" className="text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              id="status-filter"
              value={filters.status}
              onChange={(event) => updateFilters({ status: event.target.value as Filters['status'] })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">Semua Status</option>
              {(Object.keys(STATUS_LABEL) as ExternalOrderStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="sla-filter" className="text-sm font-medium text-slate-700">
              SLA
            </label>
            <select
              id="sla-filter"
              value={filters.sla_type}
              onChange={(event) => updateFilters({ sla_type: event.target.value as Filters['sla_type'] })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">Semua SLA</option>
              {(Object.keys(SLA_LABEL) as SlaType[]).map((sla) => (
                <option key={sla} value={sla}>
                  {SLA_LABEL[sla]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="page-size" className="text-sm font-medium text-slate-700">
              Per Halaman
            </label>
            <select
              id="page-size"
              value={pageSize}
              onChange={(event) => updatePageSize(Number(event.target.value) as PageSize)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : loadError ? (
        <EmptyState title="Gagal memuat data" description={loadError} />
      ) : orders.length === 0 ? (
        <EmptyState title="Gak ada order" description="Belum ada order marketplace yang cocok sama filter ini." />
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {order.external_order_id}{' '}
                    <span className="font-normal capitalize text-slate-400">-- {platformName(order.platform_id)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Diterima: {new Date(order.received_at).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                  <span className={`text-xs ${isOverdue(order) ? 'font-medium text-red-600' : 'text-slate-400'}`}>
                    {SLA_LABEL[order.sla_type]}
                    {order.sla_deadline && ` -- ${new Date(order.sla_deadline).toLocaleString('id-ID')}`}
                    {isOverdue(order) && ' (lewat)'}
                  </span>
                </div>
              </div>

              <ul className="divide-y divide-slate-100">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-slate-700">
                      {item.item_name_snapshot} <span className="text-slate-400">x{item.qty}</span>
                    </span>
                    <span className="shrink-0 text-slate-600">
                      {item.unit_price !== null ? formatRupiah(item.unit_price * item.qty) : '-'}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-400">
                  {order.payment_method && <p>Pembayaran: {order.payment_method}</p>}
                  {order.shipping_address_snapshot && (
                    <p>Alamat: {Object.values(order.shipping_address_snapshot).filter(Boolean).join(', ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-slate-900">
                    Total: {order.total_amount !== null ? formatRupiah(order.total_amount) : '-'}
                  </p>
                  <select
                    value={order.status}
                    disabled={updatingOrderId === order.id}
                    onChange={(event) => handleUpdateStatus(order.id, event.target.value as ExternalOrderStatus)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  >
                    {(Object.keys(STATUS_LABEL) as ExternalOrderStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && !loadError && (orders.length > 0 || page > 1) && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Sebelumnya
          </Button>
          <p className="text-sm text-slate-500">Halaman {page}</p>
          <Button variant="secondary" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
            Berikutnya
          </Button>
        </div>
      )}
    </>
  )
}
