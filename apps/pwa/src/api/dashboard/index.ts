import { readStoredSession } from '../../shell/auth/auth-context'
import { apiRequest } from '../client'

/** Cerminan response GET /api/dashboard (backend/src/modules/dashboard). */
export interface DashboardOverview {
  totalProducts: number
  activeProducts: number
  lowStockProducts: number
  todayPosSales: number
  todayPosTransactions: number
  marketplaceOrders: number
  marketplaceOrderValue: number
}

export interface DashboardTicketSummary {
  unassigned: number
  assigned: number
  packing: number
  packed: number
  handedOver: number
}

export interface DashboardLowStockItem {
  id: string
  name: string
  sku: string | null
  stockQty: number
  lowStockThreshold: number
}

/** Nilai mentah dari kolom stock_adjustments.reason -- TIDAK di-relabel di sini, cuma di layer tampilan (lihat StockActivitySection). */
export type StockActivityReason = 'sale' | 'manual_adjustment' | 'void_reversal' | 'external_order' | 'restock'

export interface DashboardStockActivityItem {
  id: string
  productId: string
  productName: string
  changeQty: number
  stockBefore: number
  stockAfter: number
  reason: StockActivityReason
  referenceType: string | null
  createdAt: string
}

export interface DashboardResponse {
  overview: DashboardOverview
  tickets: DashboardTicketSummary
  lowStock: DashboardLowStockItem[]
  recentStockActivity: DashboardStockActivityItem[]
}

function requireToken(): string {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login.')
  }
  return session.token
}

/** GET /api/dashboard -- Owner only. Read-only, tanpa parameter. */
export async function fetchDashboard(): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>('/dashboard', { token: requireToken() })
}
