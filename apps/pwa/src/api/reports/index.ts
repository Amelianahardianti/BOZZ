import { readStoredSession } from '../../shell/auth/auth-context'
import { apiRequest, ApiRequestError } from '../client'

export interface SalesReportPeriod {
  dateFrom: string
  dateTo: string
}

export interface SalesReportSummary {
  totalSalesAmount: number
  posSalesAmount: number
  marketplaceSalesAmount: number
  totalTransactions: number
  posTransactions: number
  marketplaceOrders: number
}

export interface SalesTrendPoint {
  date: string
  posSales: number
  marketplaceSales: number
  totalSales: number
}

export interface TopProduct {
  productId: string
  productName: string
  sku: string | null
  quantitySold: number
  totalSalesAmount: number
}

export type SalesSource = 'pos' | 'marketplace'

export interface SalesRow {
  id: string
  source: SalesSource
  reference: string
  date: string
  customer: string | null
  totalAmount: number
  status: string
}

export interface SalesReport {
  period: SalesReportPeriod
  summary: SalesReportSummary
  trend: SalesTrendPoint[]
  topProducts: TopProduct[]
  sales: SalesRow[]
}

export interface FetchSalesReportParams {
  dateFrom?: string
  dateTo?: string
}

function requireToken(): string {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login.')
  }
  return session.token
}

function buildQuery(params: FetchSalesReportParams): string {
  const qs = new URLSearchParams()
  if (params.dateFrom) qs.set('date_from', params.dateFrom)
  if (params.dateTo) qs.set('date_to', params.dateTo)
  const suffix = qs.toString()
  return suffix ? `?${suffix}` : ''
}

/** GET /api/reports/sales -- Owner only. */
export async function fetchSalesReport(params: FetchSalesReportParams = {}): Promise<SalesReport> {
  return apiRequest<SalesReport>(`/reports/sales${buildQuery(params)}`, { token: requireToken() })
}

/**
 * GET /api/reports/sales/export.xlsx -- balikin file binary, bukan JSON,
 * jadi TIDAK lewat apiRequest() (yang selalu parse JSON). fetch()
 * langsung, lalu dipicu sebagai download lewat elemen <a> sementara --
 * pola standar browser, gak butuh library baru.
 */
export async function downloadSalesReportExcel(params: FetchSalesReportParams = {}): Promise<void> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  const res = await fetch(`${API_BASE_URL}/reports/sales/export.xlsx${buildQuery(params)}`, {
    headers: { Authorization: `Bearer ${requireToken()}` },
  })

  if (!res.ok) {
    throw new ApiRequestError(res.status, 'EXPORT_FAILED', 'Gagal export Excel.')
  }

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `sales-report-${params.dateFrom ?? 'default'}-to-${params.dateTo ?? 'default'}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
