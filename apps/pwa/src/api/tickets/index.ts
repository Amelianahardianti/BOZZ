import { readStoredSession } from '../../shell/auth/auth-context'
import { apiRequest } from '../client'

export type TicketStatus = 'unassigned' | 'assigned' | 'packing' | 'packed' | 'handed_over'

export interface TicketItem {
  id: string
  product_id: string
  product_name_snapshot: string
  qty: number
  is_packed: boolean
}

/** Cerminan #/components/schemas/Ticket di contracts/api.yaml. */
export interface Ticket {
  id: string
  external_order_id: string
  assigned_to_user_id: string | null
  status: TicketStatus
  assigned_at: string | null
  assigned_by: string | null
  completed_at: string | null
  notes: string | null
  items: TicketItem[]
  created_at: string
  updated_at: string
}

function requireToken(): string {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login -- halaman Ticket wajib login.')
  }
  return session.token
}

export interface CreateTicketInput {
  external_order_id: string
  assigned_to_user_id: string
  notes?: string
  items: Array<{ product_id: string; qty: number }>
}

/** POST /api/tickets -- Owner. */
export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  return apiRequest<Ticket>('/tickets', { method: 'POST', body: input, token: requireToken() })
}

export interface FetchTicketsParams {
  status?: TicketStatus
  page?: number
  limit?: number
}

/** GET /api/tickets -- Owner. Array polos (BUKAN dibungkus {data,...} kayak /products). */
export async function fetchTickets(params: FetchTicketsParams = {}): Promise<Ticket[]> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const qs = query.toString()
  return apiRequest<Ticket[]>(`/tickets${qs ? `?${qs}` : ''}`, { token: requireToken() })
}

/** PATCH /api/tickets/:id/assign -- Owner. */
export async function assignTicket(id: string, input: { assigned_to_user_id: string }): Promise<Ticket> {
  return apiRequest<Ticket>(`/tickets/${id}/assign`, { method: 'PATCH', body: input, token: requireToken() })
}

/** GET /api/tickets/my -- Pengepak. Pengepak-nya diambil dari JWT, bukan param. */
export async function fetchMyTickets(): Promise<Ticket[]> {
  return apiRequest<Ticket[]>('/tickets/my', { token: requireToken() })
}

export interface UpdateTicketProgressInput {
  status?: TicketStatus
  ticket_items?: Array<{ id: string; is_packed: boolean }>
}

/** PATCH /api/tickets/:id/status -- Owner atau Pengepak (cuma ticket miliknya sendiri, ditegakkan di backend). */
export async function updateTicketProgress(id: string, input: UpdateTicketProgressInput): Promise<Ticket> {
  return apiRequest<Ticket>(`/tickets/${id}/status`, { method: 'PATCH', body: input, token: requireToken() })
}
