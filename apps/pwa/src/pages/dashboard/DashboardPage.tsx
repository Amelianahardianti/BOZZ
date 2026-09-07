import { useEffect, useState } from 'react'
import {
  fetchDashboard,
  type DashboardLowStockItem,
  type DashboardResponse,
  type DashboardStockActivityItem,
  type StockActivityReason,
} from '../../api/dashboard'
import { ApiRequestError } from '../../api/client'
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../../shell/design-system'
import type { BadgeTone } from '../../shell/design-system'
import { formatRupiah } from '../../shell/currency'

/** Sama persis dengan STATUS_LABEL/STATUS_TONE di pages/tickets/TicketsPage.tsx -- dipertahankan konsisten di seluruh app. */
const TICKET_STATUS_ROWS: { key: keyof DashboardResponse['tickets']; label: string; tone: BadgeTone }[] = [
  { key: 'unassigned', label: 'Belum Ditugaskan', tone: 'neutral' },
  { key: 'assigned', label: 'Ditugaskan', tone: 'info' },
  { key: 'packing', label: 'Dikemas', tone: 'warning' },
  { key: 'packed', label: 'Sudah Dikemas', tone: 'info' },
  { key: 'handedOver', label: 'Diserahkan', tone: 'success' },
]

/** Label tampilan untuk stock_adjustments.reason -- HANYA display, tidak mengubah nilai enum di database. */
const REASON_LABEL: Record<StockActivityReason, string> = {
  sale: 'POS Sale',
  external_order: 'Marketplace Order',
  manual_adjustment: 'Manual Adjustment',
  restock: 'Restock',
  void_reversal: 'Void Reversal',
}

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason as StockActivityReason] ?? reason
}

function OverviewCards({ overview }: { overview: DashboardResponse['overview'] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Products</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{overview.totalProducts}</p>
        <p className="mt-1 text-xs text-slate-500">{overview.activeProducts} active</p>
      </Card>
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Low Stock</p>
        <p className="mt-1 text-2xl font-bold text-red-600">{overview.lowStockProducts}</p>
        <p className="mt-1 text-xs text-slate-500">products</p>
      </Card>
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Today's POS Sales</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{formatRupiah(overview.todayPosSales)}</p>
        <p className="mt-1 text-xs text-slate-500">{overview.todayPosTransactions} transactions</p>
      </Card>
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Marketplace Orders</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{overview.marketplaceOrders} Orders</p>
        <p className="mt-1 text-xs text-slate-500">{formatRupiah(overview.marketplaceOrderValue)}</p>
      </Card>
    </div>
  )
}

function TicketStatusSection({ tickets }: { tickets: DashboardResponse['tickets'] }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Ticket Status</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {TICKET_STATUS_ROWS.map((row) => (
          <div key={row.key} className="rounded-lg bg-slate-50 px-3 py-2">
            <dt className="mb-1">
              <StatusBadge label={row.label} tone={row.tone} />
            </dt>
            <dd className="text-lg font-bold text-slate-900">{tickets[row.key]}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function LowStockSection({ items }: { items: DashboardLowStockItem[] }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Low Stock Products</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No low stock products 🎉</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3 text-right">Stock</th>
                <th className="py-2 text-right">Minimum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-800">{item.name}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-red-600">{item.stockQty}</td>
                  <td className="py-2 text-right text-slate-500">{item.lowStockThreshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function StockActivitySection({ items }: { items: DashboardStockActivityItem[] }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Recent Stock Activity</h2>
      {items.length === 0 ? (
        <EmptyState title="Belum ada aktivitas stok" />
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3 text-right">Change</th>
                <th className="py-2 pr-3 text-right">Before → After</th>
                <th className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-800">{item.productName}</td>
                  <td className={`py-2 pr-3 text-right font-semibold ${item.changeQty < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {item.changeQty > 0 ? `+${item.changeQty}` : item.changeQty}
                  </td>
                  <td className="py-2 pr-3 text-right text-slate-500">
                    {item.stockBefore} → {item.stockAfter}
                  </td>
                  <td className="py-2 text-slate-600">{reasonLabel(item.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  async function load() {
    setIsLoading(true)
    setLoadError(null)
    try {
      setData(await fetchDashboard())
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat dashboard.')
    } finally {
      setIsLoading(false)
    }
  }

  // load() dipanggil lewat .then() (bukan sinkron di badan efek) --
  // pola yang sama kayak ProductsPage.tsx, biar gak kena
  // react-hooks/set-state-in-effect. Tombol Refresh boleh panggil
  // load() langsung karena itu event handler, bukan efek.
  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [])

  return (
    <div>
      <PageHeader
        actions={
          <Button variant="secondary" onClick={load} isLoading={isLoading}>
            Refresh
          </Button>
        }
      />

      {isLoading && !data && <LoadingState label="Memuat dashboard..." />}

      {loadError && !data && (
        <div className="space-y-3">
          <ErrorState description={loadError} />
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <OverviewCards overview={data.overview} />
          <TicketStatusSection tickets={data.tickets} />
          <LowStockSection items={data.lowStock} />
          <StockActivitySection items={data.recentStockActivity} />
        </div>
      )}
    </div>
  )
}
