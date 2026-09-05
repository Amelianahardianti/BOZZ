import { useEffect, useState } from 'react'
import {
  assignTicket,
  fetchMyTickets,
  fetchTickets,
  updateTicketProgress,
  type Ticket,
  type TicketStatus,
} from '../../api/tickets'
import { fetchStaff, type Staff } from '../../api/staff'
import { ApiRequestError } from '../../api/client'
import { useAuth } from '../../shell/auth/useAuth'
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
  type BadgeTone,
} from '../../shell/design-system'

const STATUS_LABEL: Record<TicketStatus, string> = {
  unassigned: 'Belum Ditugaskan',
  assigned: 'Ditugaskan',
  packing: 'Dikemas',
  packed: 'Sudah Dikemas',
  handed_over: 'Diserahkan',
}

const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  unassigned: 'neutral',
  assigned: 'info',
  packing: 'warning',
  packed: 'info',
  handed_over: 'success',
}

const NEXT_STATUS: Partial<Record<TicketStatus, TicketStatus>> = {
  assigned: 'packing',
  packing: 'packed',
  packed: 'handed_over',
}

export function TicketsPage() {
  const { session } = useAuth()
  if (session?.user.role === 'pengepak') {
    return <MyTicketsView />
  }
  return <OwnerTicketBoard />
}

function MyTicketsView() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null)

  useEffect(() => {
    fetchMyTickets()
      .then(setTickets)
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat daftar ticket.')
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function toggleItem(ticket: Ticket, itemId: string, isPacked: boolean) {
    setBusyTicketId(ticket.id)
    try {
      const updated = await updateTicketProgress(ticket.id, { ticket_items: [{ id: itemId, is_packed: isPacked }] })
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? updated : t)))
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal memperbarui item ticket.')
    } finally {
      setBusyTicketId(null)
    }
  }

  async function advanceStatus(ticket: Ticket) {
    const next = NEXT_STATUS[ticket.status]
    if (!next) return
    setBusyTicketId(ticket.id)
    try {
      const updated = await updateTicketProgress(ticket.id, { status: next })
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? updated : t)))
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal mengubah status ticket.')
    } finally {
      setBusyTicketId(null)
    }
  }

  return (
    <>
      <PageHeader title="Ticket Saya" description="Ticket packing yang ditugaskan ke kamu (FR-SI-11)." />

      {isLoading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState description={loadError} />
      ) : tickets.length === 0 ? (
        <EmptyState title="Gak ada ticket" description="Belum ada ticket packing yang ditugaskan ke kamu." />
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((ticket) => {
            const next = NEXT_STATUS[ticket.status]
            const isBusy = busyTicketId === ticket.id
            return (
              <Card key={ticket.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <p className="font-semibold text-slate-900">{ticket.external_order_id}</p>
                    {ticket.notes && <p className="mt-0.5 text-xs text-slate-400">{ticket.notes}</p>}
                  </div>
                  <StatusBadge label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
                </div>

                <ul className="divide-y divide-slate-100">
                  {ticket.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <label className="flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={item.is_packed}
                          disabled={isBusy}
                          onChange={(event) => toggleItem(ticket, item.id, event.target.checked)}
                        />
                        {item.product_name_snapshot} <span className="text-slate-400">x{item.qty}</span>
                      </label>
                    </li>
                  ))}
                </ul>

                {next && (
                  <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                    <Button disabled={isBusy} onClick={() => advanceStatus(ticket)}>
                      Tandai {STATUS_LABEL[next]}
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

type StatusFilter = TicketStatus | ''

/**
 * Papan pantau & assign ticket packing (FR-SI-11) -- MURNI monitoring
 * & manajemen. Pembuatan ticket sengaja TIDAK ada di sini: entry
 * point-nya di halaman Pesanan Masuk (OrdersPage.tsx, tombol "Buat
 * Ticket" per order), karena konteks order (item, mana yang cocok
 * produknya) sudah ada di situ -- gak perlu pilih order lagi dari
 * dropdown terpisah. SRS gak mewajibkan satu halaman buat alur ini,
 * jadi pemisahan ini murni perbaikan UX, bukan koreksi requirement.
 */
function OwnerTicketBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [hasNextPage, setHasNextPage] = useState(false)

  const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null)
  const [assignSelection, setAssignSelection] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)

  const pengepakOptions = staff.filter((s) => s.role === 'pengepak' && s.is_active)

  function staffName(id: string | null) {
    if (!id) return '-'
    return staff.find((s) => s.id === id)?.name ?? id
  }

  useEffect(() => {
    Promise.resolve()
      .then(() => {
        setIsLoading(true)
        setLoadError(null)
        return Promise.all([fetchTickets({ status: statusFilter || undefined, page, limit: pageSize }), fetchStaff()])
      })
      .then(([ticketList, staffList]) => {
        setTickets(ticketList)
        setStaff(staffList)
        setHasNextPage(ticketList.length === pageSize)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat daftar ticket.')
      })
      .finally(() => setIsLoading(false))
  }, [statusFilter, page])

  async function refreshList() {
    try {
      const ticketList = await fetchTickets({ status: statusFilter || undefined, page, limit: pageSize })
      setTickets(ticketList)
      setHasNextPage(ticketList.length === pageSize)
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal memuat ulang daftar ticket.')
    }
  }

  function openAssign(ticket: Ticket) {
    setAssigningTicketId(ticket.id)
    setAssignSelection(ticket.assigned_to_user_id ?? '')
  }

  async function submitAssign() {
    if (!assigningTicketId || !assignSelection) return
    setIsAssigning(true)
    try {
      await assignTicket(assigningTicketId, { assigned_to_user_id: assignSelection })
      setAssigningTicketId(null)
      await refreshList()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal menugaskan ticket.')
    } finally {
      setIsAssigning(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Ticket Saya"
        description='Papan pantau & assign ticket packing. Ticket baru dibuat dari halaman "Pesanan Masuk" (FR-SI-11).'
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Select
            id="ticket-status-filter"
            label="Status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as StatusFilter)
              setPage(1)
            }}
          >
            <option value="">Semua Status</option>
            {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState description={loadError} />
      ) : tickets.length === 0 ? (
        <EmptyState
          title="Gak ada ticket"
          description='Belum ada ticket packing. Buat dari halaman "Pesanan Masuk" -- pilih order, lalu klik "Buat Ticket".'
        />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 font-medium">Order</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Pengepak</th>
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">
                    {ticket.external_order_id}
                    {ticket.notes && <p className="text-xs text-slate-400">{ticket.notes}</p>}
                  </td>
                  <td className="py-2">
                    <StatusBadge label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
                  </td>
                  <td className="py-2 text-slate-500">{staffName(ticket.assigned_to_user_id)}</td>
                  <td className="py-2 text-slate-500">{ticket.items.length}</td>
                  <td className="py-2">
                    <button type="button" className="text-brand-600 hover:underline" onClick={() => openAssign(ticket)}>
                      {ticket.assigned_to_user_id ? 'Tugaskan Ulang' : 'Tugaskan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!isLoading && !loadError && (tickets.length > 0 || page > 1) && (
        <Pagination page={page} hasNextPage={hasNextPage} onPrevious={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
      )}

      {assigningTicketId && (
        <Modal className="max-w-sm" labelledBy="assign-ticket-title">
          <div className="flex flex-col gap-4">
            <h2 id="assign-ticket-title" className="text-base font-semibold text-slate-900">
              Tugaskan Ticket
            </h2>
            <Select
              id="assign-pengepak"
              label="Pengepak"
              value={assignSelection}
              onChange={(event) => setAssignSelection(event.target.value)}
            >
              <option value="">Pilih pengepak...</option>
              {pengepakOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setAssigningTicketId(null)} disabled={isAssigning}>
                Batal
              </Button>
              <Button className="flex-1" disabled={!assignSelection} isLoading={isAssigning} onClick={submitAssign}>
                Simpan
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
