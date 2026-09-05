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
import { createTicket } from '../../api/tickets'
import { fetchStaff, type Staff } from '../../api/staff'
import { ApiRequestError } from '../../api/client'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  TextInput,
  type BadgeTone,
} from '../../shell/design-system'
import { formatRupiah } from '../../shell/currency'

// Order yang masih aktif (belum selesai/batal) yang boleh dibikinkan
// ticket packing -- order yang sudah completed/cancelled gak relevan lagi
// buat dikemas.
const TICKETABLE_STATUSES: ExternalOrderStatus[] = ['new', 'processing']

const STATUS_LABEL: Record<ExternalOrderStatus, string> = {
  new: 'Baru',
  processing: 'Diproses',
  shipped: 'Dikirim',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
}

const STATUS_TONE: Record<ExternalOrderStatus, BadgeTone> = {
  new: 'info',
  processing: 'warning',
  shipped: 'info',
  completed: 'success',
  cancelled: 'neutral',
}

// Label UI "Jenis Pengiriman" -- SlaType/SLA_LABEL (nama variabel & key)
// SENGAJA tidak diubah, "SLA" tetap konsep/domain internal. Cuma teks
// yang ditampilkan ke user yang diganti, karena instant/same_day/reguler
// itu jenis pengiriman yang menentukan batas waktu proses/packing --
// bukan istilah "SLA" yang teknis buat user non-teknis.
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

  const [pengepakList, setPengepakList] = useState<Staff[]>([])
  const [creatingTicketFor, setCreatingTicketFor] = useState<OrderDetail | null>(null)
  const [ticketPengepakId, setTicketPengepakId] = useState('')
  const [ticketNotes, setTicketNotes] = useState('')
  const [ticketError, setTicketError] = useState<string | null>(null)
  const [isCreatingTicket, setIsCreatingTicket] = useState(false)
  // Order yang barusan dibikinkan ticket -- ditandai lokal biar tombol
  // "Buat Ticket"-nya langsung hilang tanpa nunggu reload, TAPI ini
  // cuma tau ticket yang dibikin lewat sesi halaman ini sendiri. Kalau
  // order-nya udah punya ticket dari sesi/pengguna lain, backend yang
  // nolak (409 Conflict) -- pesannya ditampilin apa adanya.
  const [ticketCreatedOrderIds, setTicketCreatedOrderIds] = useState<Set<string>>(new Set())

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

  // Daftar pengepak gak terikat filter/halaman order, jadi cukup ditarik
  // sekali pas halaman dibuka -- dipakai buat dropdown di form "Buat Ticket".
  useEffect(() => {
    fetchStaff()
      .then((staff) => setPengepakList(staff.filter((s) => s.role === 'pengepak' && s.is_active)))
      .catch(() => {
        // Gagal diam-diam -- dropdown pengepak bakal kosong, ketauan pas
        // user coba buka form "Buat Ticket" (gak ada pilihan sama sekali).
      })
  }, [])

  function openCreateTicket(order: OrderDetail) {
    setCreatingTicketFor(order)
    setTicketPengepakId('')
    setTicketNotes('')
    setTicketError(null)
  }

  async function handleCreateTicket() {
    if (!creatingTicketFor) return
    if (!ticketPengepakId) {
      setTicketError('Pilih pengepak dulu.')
      return
    }

    const validItems = creatingTicketFor.items.filter((item) => item.product_id)
    if (validItems.length === 0) {
      setTicketError('Order ini gak punya item dengan produk yang cocok di katalog -- gak bisa dibikinkan ticket.')
      return
    }

    setIsCreatingTicket(true)
    setTicketError(null)
    try {
      await createTicket({
        external_order_id: creatingTicketFor.id,
        assigned_to_user_id: ticketPengepakId,
        notes: ticketNotes.trim() || undefined,
        items: validItems.map((item) => ({ product_id: item.product_id as string, qty: item.qty })),
      })
      setTicketCreatedOrderIds((prev) => new Set(prev).add(creatingTicketFor.id))
      setCreatingTicketFor(null)
    } catch (err) {
      setTicketError(err instanceof ApiRequestError ? err.message : 'Gagal membuat ticket.')
    } finally {
      setIsCreatingTicket(false)
    }
  }

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
      <PageHeader
        title="Pesanan Masuk"
        description="Daftar order marketplace, filter platform/status/jenis pengiriman (FR-OC-05)."
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Select
            id="platform-filter"
            label="Platform"
            value={filters.platform_id}
            onChange={(event) => updateFilters({ platform_id: event.target.value })}
          >
            <option value="">Semua Platform</option>
            {platforms
              .filter((p) => p.id)
              .map((p) => (
                <option key={p.platform_name} value={p.id ?? ''}>
                  {p.platform_name}
                </option>
              ))}
          </Select>
          <Select
            id="status-filter"
            label="Status"
            value={filters.status}
            onChange={(event) => updateFilters({ status: event.target.value as Filters['status'] })}
          >
            <option value="">Semua Status</option>
            {(Object.keys(STATUS_LABEL) as ExternalOrderStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
          <Select
            id="sla-filter"
            label="Jenis Pengiriman"
            value={filters.sla_type}
            onChange={(event) => updateFilters({ sla_type: event.target.value as Filters['sla_type'] })}
          >
            <option value="">Semua Jenis Pengiriman</option>
            {(Object.keys(SLA_LABEL) as SlaType[]).map((sla) => (
              <option key={sla} value={sla}>
                {SLA_LABEL[sla]}
              </option>
            ))}
          </Select>
          <Select
            id="page-size"
            label="Per Halaman"
            value={pageSize}
            onChange={(event) => updatePageSize(Number(event.target.value) as PageSize)}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState description={loadError} />
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
                  <StatusBadge label={STATUS_LABEL[order.status]} tone={STATUS_TONE[order.status]} />
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
                    aria-label="Ubah status order"
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
                  {TICKETABLE_STATUSES.includes(order.status) && !ticketCreatedOrderIds.has(order.id) && (
                    <Button variant="secondary" onClick={() => openCreateTicket(order)}>
                      Buat Ticket
                    </Button>
                  )}
                  {ticketCreatedOrderIds.has(order.id) && (
                    <span className="text-xs font-medium text-green-600">Ticket dibuat</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && !loadError && (orders.length > 0 || page > 1) && (
        <Pagination page={page} hasNextPage={hasNextPage} onPrevious={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      {creatingTicketFor && (
        <Modal className="max-w-md" labelledBy="create-ticket-title">
          <div className="flex flex-col gap-4">
            <h2 id="create-ticket-title" className="text-base font-semibold text-slate-900">
              Buat Ticket -- {creatingTicketFor.external_order_id}
            </h2>

            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              {(() => {
                const validItems = creatingTicketFor.items.filter((item) => item.product_id)
                const invalidCount = creatingTicketFor.items.length - validItems.length
                return (
                  <>
                    <p className="font-medium">Item ({validItems.length}):</p>
                    <ul className="list-disc pl-4">
                      {validItems.map((item) => (
                        <li key={item.id}>
                          {item.item_name_snapshot} x{item.qty}
                        </li>
                      ))}
                    </ul>
                    {invalidCount > 0 && (
                      <p className="mt-1 text-amber-600">
                        {invalidCount} item gak punya produk yang cocok di katalog -- gak ikut dibikinkan ticket.
                      </p>
                    )}
                  </>
                )
              })()}
            </div>

            <Select
              id="ticket-pengepak"
              label="Pengepak"
              value={ticketPengepakId}
              onChange={(event) => setTicketPengepakId(event.target.value)}
            >
              <option value="">Pilih pengepak...</option>
              {pengepakList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>

            <TextInput
              id="ticket-notes"
              label="Catatan (opsional)"
              value={ticketNotes}
              onChange={(event) => setTicketNotes(event.target.value)}
            />

            {ticketError && <p className="text-sm text-red-600">{ticketError}</p>}

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setCreatingTicketFor(null)} disabled={isCreatingTicket}>
                Batal
              </Button>
              <Button className="flex-1" isLoading={isCreatingTicket} onClick={handleCreateTicket}>
                Simpan
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
