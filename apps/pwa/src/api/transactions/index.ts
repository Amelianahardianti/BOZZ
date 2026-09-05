import { readStoredSession } from '../../shell/auth/auth-context'
import { apiRequest } from '../client'

export type TransactionType = 'walk_in' | 'pre_order'
export type PaymentMethod = 'cash' | 'transfer' | 'ewallet'

export interface TransactionItemInput {
  product_id: string
  qty: number
}

/** Body POST /api/transactions (TransactionCreateRequest, contracts/api.yaml). */
export interface TransactionCreateRequest {
  type: TransactionType
  customer_id?: string | null
  payment_method: PaymentMethod
  amount_paid?: number | null
  items: TransactionItemInput[]
}

export interface TransactionItem {
  id: string
  product_id: string
  product_name_snapshot: string
  qty: number
  unit_price: number
  subtotal: number
}

export interface Transaction {
  id: string
  idempotency_key: string
  type: TransactionType
  customer_id: string | null
  cashier_user_id: string
  payment_method: PaymentMethod
  subtotal: number
  total_amount: number
  amount_paid: number | null
  change_amount: number | null
  status: 'completed' | 'voided'
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  synced_offline: boolean
  items: TransactionItem[]
  created_at: string
}

/**
 * POST /api/transactions -- WAJIB header Idempotency-Key (SRS 9.3):
 * request yang sama diulang (mis. retry sync offline) balikin
 * transaksi yang udah ada, bukan bikin transaksi baru / potong stok
 * dobel. Dipanggil offline-sync engine (shell/offline/outbox.ts).
 */
export async function postTransaction(body: TransactionCreateRequest, idempotencyKey: string): Promise<Transaction> {
  const session = readStoredSession()
  if (!session) {
    throw new Error('postTransaction dipanggil tanpa sesi login -- checkout wajib login duluan.')
  }

  return apiRequest<Transaction>('/transactions', {
    method: 'POST',
    body,
    token: session.token,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}
