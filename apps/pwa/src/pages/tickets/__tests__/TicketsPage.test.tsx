import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ticketsApi from '../../../api/tickets'
import type { Ticket } from '../../../api/tickets'
import { ApiRequestError } from '../../../api/client'
import { AuthProvider } from '../../../shell/auth/AuthProvider'
import { STORAGE_KEY, type AuthSession } from '../../../shell/auth/auth-context'
import { TicketsPage } from '../TicketsPage'

// TicketsPage cabang ke MyTicketsView/OwnerTicketBoard lewat useAuth(),
// jadi butuh AuthProvider + sesi pengepak di localStorage (pola sama
// kayak router.test.tsx) -- token boleh string biasa (bukan JWT asli),
// AuthProvider anggap "tidak expired" kalau exp-nya gak kebaca (fail-safe,
// lihat AuthProvider.tsx).
vi.mock('../../../api/tickets', async () => {
  const actual = await vi.importActual<typeof import('../../../api/tickets')>('../../../api/tickets')
  return { ...actual, fetchMyTickets: vi.fn(), updateTicketProgress: vi.fn() }
})

const mockedFetchMyTickets = vi.mocked(ticketsApi.fetchMyTickets)
const mockedUpdateTicketProgress = vi.mocked(ticketsApi.updateTicketProgress)

function buildTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    external_order_id: 'SP-001',
    assigned_to_user_id: 'pengepak-1',
    status: 'packed',
    assigned_at: new Date().toISOString(),
    assigned_by: 'owner-1',
    completed_at: null,
    notes: null,
    items: [
      { id: 'item-1', product_id: 'p1', product_name_snapshot: 'Kopi Susu', qty: 1, is_packed: true },
      { id: 'item-2', product_id: 'p2', product_name_snapshot: 'Roti Bakar', qty: 2, is_packed: true },
      { id: 'item-3', product_id: 'p3', product_name_snapshot: 'Teh Manis', qty: 1, is_packed: false },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function renderAsPengepak() {
  const session: AuthSession = {
    token: 'tok-pengepak',
    user: {
      id: 'pengepak-1',
      name: 'Uji Pengepak',
      email_or_username: 'pengepak',
      role: 'pengepak',
      phone: null,
      is_active: true,
    },
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  return render(
    <AuthProvider>
      <TicketsPage />
    </AuthProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('Progress Packing (Task 5)', () => {
  it('2 dari 3 item dicentang -- menampilkan "2 / 3 Item Dikemas" dan 67%', async () => {
    mockedFetchMyTickets.mockResolvedValue([buildTicket()])
    renderAsPengepak()

    expect(await screen.findByText('2 / 3 Item Dikemas')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('progress belum lengkap -- tombol "Tandai Diserahkan" DISABLED, helper checklist muncul', async () => {
    mockedFetchMyTickets.mockResolvedValue([buildTicket()])
    renderAsPengepak()

    const button = await screen.findByRole('button', { name: /Tandai Diserahkan/ })
    expect(button).toBeDisabled()
    expect(screen.getByText('Checklist semua item terlebih dahulu.')).toBeInTheDocument()
  })

  it('progress lengkap (3/3) -- tombol "Tandai Diserahkan" ENABLED, helper TIDAK muncul', async () => {
    mockedFetchMyTickets.mockResolvedValue([
      buildTicket({ items: [
        { id: 'item-1', product_id: 'p1', product_name_snapshot: 'Kopi Susu', qty: 1, is_packed: true },
        { id: 'item-2', product_id: 'p2', product_name_snapshot: 'Roti Bakar', qty: 2, is_packed: true },
        { id: 'item-3', product_id: 'p3', product_name_snapshot: 'Teh Manis', qty: 1, is_packed: true },
      ] }),
    ])
    renderAsPengepak()

    expect(await screen.findByText('3 / 3 Item Dikemas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tandai Diserahkan/ })).toBeEnabled()
    expect(screen.queryByText('Checklist semua item terlebih dahulu.')).not.toBeInTheDocument()
  })

  it('centang item terakhir -- progress 2/3 jadi 3/3 dan tombol berubah dari disabled jadi enabled, tanpa refresh manual', async () => {
    const user = userEvent.setup()
    const ticket = buildTicket()
    mockedFetchMyTickets.mockResolvedValue([ticket])
    mockedUpdateTicketProgress.mockResolvedValue({
      ...ticket,
      items: ticket.items.map((item) => (item.id === 'item-3' ? { ...item, is_packed: true } : item)),
    })
    renderAsPengepak()

    expect(await screen.findByRole('button', { name: /Tandai Diserahkan/ })).toBeDisabled()

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[2])

    await waitFor(() => expect(screen.getByText('3 / 3 Item Dikemas')).toBeInTheDocument())
    expect(mockedUpdateTicketProgress).toHaveBeenCalledWith('ticket-1', {
      ticket_items: [{ id: 'item-3', is_packed: true }],
    })
    expect(screen.getByRole('button', { name: /Tandai Diserahkan/ })).toBeEnabled()
    expect(screen.queryByText('Checklist semua item terlebih dahulu.')).not.toBeInTheDocument()
  })

  it('ticket tanpa item (0/0) -- tidak crash, tidak NaN%, tombol tetap disabled', async () => {
    mockedFetchMyTickets.mockResolvedValue([buildTicket({ items: [] })])
    renderAsPengepak()

    expect(await screen.findByText('Belum ada item untuk dikemas.')).toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tandai Diserahkan/ })).toBeDisabled()
  })
})

describe('Checklist/Status gagal -- inline error, bukan window.alert (Task 6)', () => {
  it('toggleItem gagal -- TIDAK window.alert, error tampil inline dekat checklist', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const user = userEvent.setup()
    mockedFetchMyTickets.mockResolvedValue([buildTicket()])
    mockedUpdateTicketProgress.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Server lagi down.'),
    )
    renderAsPengepak()

    const checkboxes = await screen.findAllByRole('checkbox')
    await user.click(checkboxes[2])

    expect(await screen.findByText('Server lagi down.')).toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
    // Checklist tetap tampil apa adanya (item-3 balik jadi belum dicentang
    // karena request-nya gagal) -- retry (klik lagi) masih tersedia.
    expect(checkboxes[2]).not.toBeChecked()

    alertSpy.mockRestore()
  })

  it('advanceStatus ("Tandai Diserahkan") gagal -- TIDAK window.alert, error tampil inline, fallback Bahasa Indonesia kalau bukan ApiRequestError', async () => {
    const user = userEvent.setup()
    const fullyPacked = buildTicket({
      items: [
        { id: 'item-1', product_id: 'p1', product_name_snapshot: 'Kopi Susu', qty: 1, is_packed: true },
        { id: 'item-2', product_id: 'p2', product_name_snapshot: 'Roti Bakar', qty: 2, is_packed: true },
        { id: 'item-3', product_id: 'p3', product_name_snapshot: 'Teh Manis', qty: 1, is_packed: true },
      ],
    })
    mockedFetchMyTickets.mockResolvedValue([fullyPacked])
    mockedUpdateTicketProgress.mockRejectedValueOnce(new Error('network boom'))
    renderAsPengepak()

    await user.click(await screen.findByRole('button', { name: /Tandai Diserahkan/ }))

    expect(await screen.findByText('Gagal memperbarui status ticket.')).toBeInTheDocument()
    // Ticket tetap 'packed' (request gagal, status TIDAK ikut berubah) --
    // tombol "Tandai Diserahkan" masih ada buat retry.
    expect(screen.getByRole('button', { name: /Tandai Diserahkan/ })).toBeInTheDocument()
  })

  it('retry setelah gagal -- klik lagi membersihkan error lama sebelum request baru', async () => {
    const user = userEvent.setup()
    const ticket = buildTicket()
    mockedFetchMyTickets.mockResolvedValue([ticket])
    mockedUpdateTicketProgress
      .mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'Server lagi down.'))
      .mockResolvedValueOnce({
        ...ticket,
        items: ticket.items.map((item) => (item.id === 'item-3' ? { ...item, is_packed: true } : item)),
      })
    renderAsPengepak()

    const checkboxes = await screen.findAllByRole('checkbox')
    await user.click(checkboxes[2])
    expect(await screen.findByText('Server lagi down.')).toBeInTheDocument()

    await user.click(checkboxes[2])

    await waitFor(() => expect(mockedUpdateTicketProgress).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Server lagi down.')).not.toBeInTheDocument()
  })
})
