import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, type AuthSession } from '../shell/auth/auth-context'
import { fetchOrderDetail, fetchOrders, updateOrderStatus } from './orders'

const originalFetch = globalThis.fetch

const session: AuthSession = {
  token: 'token-owner-uji',
  user: { id: 'user-1', name: 'Owner', email_or_username: 'owner', role: 'owner', phone: null, is_active: true },
}

beforeEach(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
})

afterEach(() => {
  localStorage.clear()
  globalThis.fetch = originalFetch
})

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('fetchOrders', () => {
  it('GET /orders, total_amount STRING dari backend (Decimal Prisma) dinormalisasi jadi number', async () => {
    mockFetchOnce(200, [
      { id: '1', platform_id: 'p1', external_order_id: 'SP-1', customer_id: null, status: 'new', sla_type: 'instant', sla_deadline: null, total_amount: '150000', received_at: '2026-01-01T00:00:00Z' },
    ])

    const result = await fetchOrders()

    expect(result[0].total_amount).toBe(150000)
    expect(typeof result[0].total_amount).toBe('number')
  })

  it('total_amount null tetap null (bukan NaN atau 0)', async () => {
    mockFetchOnce(200, [
      { id: '1', platform_id: 'p1', external_order_id: 'SP-1', customer_id: null, status: 'new', sla_type: 'instant', sla_deadline: null, total_amount: null, received_at: '2026-01-01T00:00:00Z' },
    ])

    const result = await fetchOrders()

    expect(result[0].total_amount).toBeNull()
  })

  it('nge-build query string dari filter yang dikasih', async () => {
    const fetchMock = mockFetchOnce(200, [])

    await fetchOrders({ platform_id: 'p1', status: 'processing', sla_type: 'same_day', limit: 50 })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/orders?')
    expect(url).toContain('platform_id=p1')
    expect(url).toContain('status=processing')
    expect(url).toContain('sla_type=same_day')
    expect(url).toContain('limit=50')
  })
})

describe('fetchOrderDetail', () => {
  // Field respons ASLI backend beda nama dari contracts/api.yaml --
  // `external_order_items` (bukan `items`) & `order_shipping_address`
  // (bukan `shipping_address_snapshot`), ketauan pas dicek langsung ke
  // endpoint beneran. Fixture di sini SENGAJA niru bentuk ASLI itu, biar
  // ketauan lagi kalau field mapping-nya kegeser suatu saat.
  it('GET /orders/:id, mapping external_order_items -> items & order_shipping_address -> shipping_address_snapshot, plus normalisasi angka', async () => {
    mockFetchOnce(200, {
      id: '1',
      platform_id: 'p1',
      external_order_id: 'SP-1',
      customer_id: null,
      status: 'new',
      sla_type: 'instant',
      sla_deadline: null,
      total_amount: '150000',
      received_at: '2026-01-01T00:00:00Z',
      payment_method: null,
      order_shipping_address: { address: 'Jl. Melati No. 5' },
      raw_payload: {},
      external_order_items: [
        { id: 'i1', product_id: null, external_item_ref: null, item_name_snapshot: 'Kopi', qty: 2, unit_price: '18000' },
      ],
    })

    const result = await fetchOrderDetail('1')

    expect(result.total_amount).toBe(150000)
    expect(result.shipping_address_snapshot).toEqual({ address: 'Jl. Melati No. 5' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].item_name_snapshot).toBe('Kopi')
    expect(result.items[0].unit_price).toBe(18000)
    expect(typeof result.items[0].unit_price).toBe('number')
  })
})

describe('updateOrderStatus', () => {
  it('PATCH /orders/:id/status dengan body status, hasilnya ikut dinormalisasi', async () => {
    const fetchMock = mockFetchOnce(200, {
      id: '1',
      platform_id: 'p1',
      external_order_id: 'SP-1',
      customer_id: null,
      status: 'processing',
      sla_type: 'instant',
      sla_deadline: null,
      total_amount: '150000',
      received_at: '2026-01-01T00:00:00Z',
    })

    const result = await updateOrderStatus('1', 'processing')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/orders/1/status')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ status: 'processing' })
    expect(result.total_amount).toBe(150000)
  })
})

describe('tanpa sesi login', () => {
  it('lempar error, gak manggil fetch sama sekali', async () => {
    localStorage.clear()
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(fetchOrders()).rejects.toThrow(/tanpa sesi login/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
