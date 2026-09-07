import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ticketsApi from '../../../api/tickets'
import type { Ticket } from '../../../api/tickets'
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
