import { useEffect, useState } from 'react'
import {
  downloadSalesReportExcel,
  fetchSalesReport,
  type SalesReport,
  type SalesRow,
} from '../../api/reports'
import { ApiRequestError } from '../../api/client'
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatusBadge, TextInput } from '../../shell/design-system'
import type { BadgeTone } from '../../shell/design-system'
import { formatRupiah } from '../../shell/currency'

const PAGE_SIZE = 10

const SOURCE_LABEL: Record<SalesRow['source'], string> = { pos: 'POS', marketplace: 'Marketplace' }
const SOURCE_TONE: Record<SalesRow['source'], BadgeTone> = { pos: 'info', marketplace: 'success' }

const STATUS_TONE: Record<string, BadgeTone> = {
  completed: 'success',
  voided: 'danger',
  new: 'info',
  processing: 'warning',
  shipped: 'warning',
  cancelled: 'danger',
}

/** "2026-08-31" -> "31 Agu 2026", dibaca sebagai tanggal lokal (bukan UTC) -- konsisten dengan aturan timezone laporan ini. */
function formatIsoDate(isoDate: string): string {
  const [tahun, bulan, hari] = isoDate.split('-').map(Number)
  return new Date(tahun, bulan - 1, hari).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Escape satu field CSV (RFC 4180) -- bungkus kutip dua kalau ada koma/kutip/baris baru. */
function csvField(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function buildCsv(sales: SalesRow[]): string {
  const header = ['Date', 'Source', 'Reference', 'Customer', 'Amount', 'Status']
  const rows = sales.map((row) => [
    formatDateTime(row.date),
    SOURCE_LABEL[row.source],
    row.reference,
    row.customer ?? '',
    row.totalAmount,
    row.status,
  ])
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\n')
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function SummaryCards({ summary }: { summary: SalesReport['summary'] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Sales</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{formatRupiah(summary.totalSalesAmount)}</p>
      </Card>
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">POS Sales</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{formatRupiah(summary.posSalesAmount)}</p>
        <p className="mt-1 text-xs text-slate-500">{summary.posTransactions} transactions</p>
      </Card>
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Marketplace Sales</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{formatRupiah(summary.marketplaceSalesAmount)}</p>
        <p className="mt-1 text-xs text-slate-500">{summary.marketplaceOrders} orders</p>
      </Card>
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Transactions</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{summary.totalTransactions}</p>
      </Card>
    </div>
  )
}

/** Bar chart CSS murni -- gak nambah chart library baru (audit: belum ada satu pun di frontend). */
function SalesTrendChart({ trend }: { trend: SalesReport['trend'] }) {
  const hasSales = trend.some((t) => t.totalSales > 0)

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Sales Trend</h2>
      {!hasSales ? (
        <p className="mt-3 text-sm text-slate-500">No sales data</p>
      ) : (
        <div className="mt-4 flex gap-px">
          {trend.map((point, index) => {
            const max = Math.max(...trend.map((t) => t.totalSales), 1)
            const BAR_AREA_PX = 128
            const heightPx = Math.max((point.totalSales / max) * BAR_AREA_PX, point.totalSales > 0 ? 4 : 0)
            // Terlalu banyak titik (mis. rentang 30 hari) bikin label
            // tanggal bertabrakan -- tampilkan maks ~10 label, sisanya
            // tetap kebaca lewat tooltip (title) pas di-hover. `min-w-0`
            // (bukan min-w-8) sengaja -- SEMUA bar harus tetap kelihatan
            // tanpa scroll horizontal, walau harus menyempit kalau
            // rentangnya panjang (mis. 90 hari); dulu ada bug: bar hari
            // terakhir (data asli sering menumpuk di sana) malah
            // ke-scroll keluar layar dan chart-nya keliatan kosong.
            const showLabel = index % Math.max(1, Math.ceil(trend.length / 10)) === 0 || index === trend.length - 1
            return (
              <div key={point.date} className="flex min-w-0 flex-1 flex-col gap-1" title={`${formatIsoDate(point.date)}: ${formatRupiah(point.totalSales)}`}>
                {/* items-stretch (default) SENGAJA dipertahankan di sini,
                    BUKAN items-center -- kalau di-center, div ini
                    menyusut ke lebar kontennya sendiri (0, karena kosong)
                    dan w-full di bar anaknya ikut resolve jadi 0. Label
                    di bawah di-center lewat text-center di <span>, bukan
                    align-items di sini. */}
                <div className="flex items-end" style={{ height: BAR_AREA_PX }}>
                  <div className="w-full rounded-t bg-brand-500" style={{ height: heightPx }} />
                </div>
                <span className="text-center text-[10px] whitespace-nowrap text-slate-400">{showLabel ? formatIsoDate(point.date).slice(0, 6) : ''}</span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function TopProductsSection({ topProducts }: { topProducts: SalesReport['topProducts'] }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Top Products</h2>
      {topProducts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No product sales data</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {topProducts.map((p, i) => (
            <li key={p.productId} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{i + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{p.productName}</p>
                  {p.sku && <p className="truncate text-xs text-slate-400">{p.sku}</p>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-slate-900">{p.quantitySold} sold</p>
                <p className="text-xs text-slate-500">{formatRupiah(p.totalSalesAmount)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function SalesTable({ sales }: { sales: SalesRow[] }) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(sales.length / PAGE_SIZE))
  const pageRows = sales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Sales Detail</h2>
      {sales.length === 0 ? (
        <EmptyState title="No sales found for this period." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="rounded-lg bg-brand-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white">Customer</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white">Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-white">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(row.date)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={SOURCE_LABEL[row.source]} tone={SOURCE_TONE[row.source]} />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.reference}</td>
                    <td className="px-4 py-3 text-slate-500">{row.customer ?? '-'}</td>
                    <td className="px-4 py-3 text-right">{formatRupiah(row.totalAmount)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={row.status} tone={STATUS_TONE[row.status] ?? 'neutral'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} hasNextPage={page < totalPages} totalPages={totalPages} onPrevious={() => setPage((p) => p - 1)} onNext={() => setPage((p) => p + 1)} />
        </>
      )}
    </Card>
  )
}

export function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(29))
  const [dateTo, setDateTo] = useState(todayIso())
  const [report, setReport] = useState<SalesReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isExportingExcel, setIsExportingExcel] = useState(false)

  async function load() {
    setIsLoading(true)
    setLoadError(null)
    try {
      setReport(await fetchSalesReport({ dateFrom, dateTo }))
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : 'Unable to load sales report.')
    } finally {
      setIsLoading(false)
    }
  }

  // load() dilempar lewat .then() (bukan sinkron di badan efek) supaya
  // gak kena react-hooks/set-state-in-effect -- pola sama seperti
  // DashboardPage.tsx (Task 12A.2). Cuma jalan sekali pas mount; filter
  // periode dipicu manual lewat tombol "Apply Filter".
  useEffect(() => {
    Promise.resolve().then(() => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleExportCsv() {
    if (!report) return
    downloadCsv(`sales-report-${report.period.dateFrom}-to-${report.period.dateTo}.csv`, buildCsv(report.sales))
  }

  async function handleExportExcel() {
    setIsExportingExcel(true)
    try {
      await downloadSalesReportExcel({ dateFrom, dateTo })
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal export Excel.')
    } finally {
      setIsExportingExcel(false)
    }
  }

  return (
    <div>
      <PageHeader />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="sm:w-44">
            <TextInput id="report-date-from" label="Start Date" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={dateTo} />
          </div>
          <div className="sm:w-44">
            <TextInput id="report-date-to" label="End Date" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} min={dateFrom} />
          </div>
          <Button onClick={load} isLoading={isLoading}>
            Apply Filter
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={handleExportCsv} disabled={!report || report.sales.length === 0}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={handleExportExcel} isLoading={isExportingExcel} disabled={!report || report.sales.length === 0}>
              Export Excel
            </Button>
          </div>
        </div>
      </Card>

      {isLoading && !report && <LoadingState label="Loading report..." />}

      {loadError && !report && (
        <div className="space-y-3">
          <ErrorState description={loadError} />
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <SummaryCards summary={report.summary} />
          <SalesTrendChart trend={report.trend} />
          <TopProductsSection topProducts={report.topProducts} />
          <SalesTable sales={report.sales} />
        </div>
      )}
    </div>
  )
}
