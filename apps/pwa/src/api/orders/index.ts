import { readStoredSession } from '../../shell/auth/auth-context'
import { apiRequest } from '../client'

export type ExternalOrderStatus = 'new' | 'processing' | 'shipped' | 'completed' | 'cancelled'
export type SlaType = 'instant' | 'same_day' | 'reguler'

/** Cerminan #/components/schemas/ExternalOrderListItem -- TANPA raw_payload (SRS 10.5). */
export interface OrderListItem {
  id: string
  platform_id: string
  external_order_id: string
  customer_id: string | null
  status: ExternalOrderStatus
  sla_type: SlaType
  sla_deadline: string | null
  total_amount: number | null
  received_at: string
}

export interface OrderItem {
  id: string
  product_id: string | null
  external_item_ref: string | null
  item_name_snapshot: string
  qty: number
  unit_price: number | null
}

/** Cerminan #/components/schemas/ExternalOrderDetail -- raw_payload boleh disertakan di sini (SRS 10.5). */
export interface OrderDetail extends OrderListItem {
  payment_method: string | null
  shipping_address_snapshot: Record<string, unknown> | null
  raw_payload: unknown
  items: OrderItem[]
}

export interface FetchOrdersParams {
  platform_id?: string
  status?: ExternalOrderStatus
  sla_type?: SlaType
  page?: number
  limit?: number
}

// Dua penyimpangan nyata dari contracts/api.yaml, ketauan pas dites
// LANGSUNG ke endpoint asli (bukan asumsi dari dokumen) -- tipe Raw* di
// bawah ini apa adanya dari wire:
//  1. total_amount/unit_price disimpan Postgres DECIMAL lewat Prisma --
//     Prisma men-serialize Decimal ke STRING di JSON (mis. "150000"),
//     BUKAN number walau kontrak bilang `type: number`.
//  2. Field detail order BEDA nama sama kontrak: kontrak bilang `items`
//     & `shipping_address_snapshot`, tapi respons asli GET /orders/:id
//     pakai `external_order_items` & `order_shipping_address`. Kode
//     modul ecommerce-sync (Orang B) inilah yang jadi sumber kebenaran
//     dipakai di sini, bukan dokumen kontraknya -- kalau nanti
//     kontraknya diperbaiki menyusul, cukup field mapping di
//     normalizeOrderDetail() ini yang disesuaikan.
type RawOrderListItem = Omit<OrderListItem, 'total_amount'> & { total_amount: string | number | null }
type RawOrderItem = Omit<OrderItem, 'unit_price'> & { unit_price: string | number | null }
type RawOrderDetail = Omit<OrderDetail, 'total_amount' | 'items' | 'shipping_address_snapshot'> & {
  total_amount: string | number | null
  external_order_items: RawOrderItem[]
  order_shipping_address: Record<string, unknown> | null
}

function toNumber(value: string | number | null): number | null {
  if (value === null) return null
  return typeof value === 'number' ? value : Number(value)
}

function normalizeOrder(raw: RawOrderListItem): OrderListItem {
  return { ...raw, total_amount: toNumber(raw.total_amount) }
}

function normalizeOrderDetail(raw: RawOrderDetail): OrderDetail {
  const { external_order_items, order_shipping_address, ...rest } = raw
  return {
    ...rest,
    total_amount: toNumber(raw.total_amount),
    shipping_address_snapshot: order_shipping_address,
    items: external_order_items.map((item) => ({ ...item, unit_price: toNumber(item.unit_price) })),
  }
}

function requireToken(): string {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login.')
  }
  return session.token
}

/** GET /api/orders -- Owner. Balikin array langsung (bukan wrapper paginated), sort default sla_deadline_asc di backend. */
export async function fetchOrders(params: FetchOrdersParams = {}): Promise<OrderListItem[]> {
  const query = new URLSearchParams()
  if (params.platform_id) query.set('platform_id', params.platform_id)
  if (params.status) query.set('status', params.status)
  if (params.sla_type) query.set('sla_type', params.sla_type)
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const qs = query.toString()
  const raw = await apiRequest<RawOrderListItem[]>(`/orders${qs ? `?${qs}` : ''}`, { token: requireToken() })
  return raw.map(normalizeOrder)
}

/** GET /api/orders/:id -- Owner. */
export async function fetchOrderDetail(id: string): Promise<OrderDetail> {
  const raw = await apiRequest<RawOrderDetail>(`/orders/${id}`, { token: requireToken() })
  return normalizeOrderDetail(raw)
}

/** PATCH /api/orders/:id/status -- Owner, override manual (biasanya status berubah otomatis dari alur ticket packing). */
export async function updateOrderStatus(id: string, status: ExternalOrderStatus): Promise<OrderListItem> {
  const raw = await apiRequest<RawOrderListItem>(`/orders/${id}/status`, {
    method: 'PATCH',
    body: { status },
    token: requireToken(),
  })
  return normalizeOrder(raw)
}
