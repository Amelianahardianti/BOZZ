import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ordersApi from '../api/orders'
import type { OrderDetail } from '../api/orders'
import * as platformsApi from '../api/platforms'
import type { Platform } from '../api/platforms'
import { ApiRequestError } from '../api/client'
import { OrdersPage } from './OrdersPage'

vi.mock('../api/orders', () => ({
  fetchOrders: vi.fn(),
  fetchOrderDetail: vi.fn(),
  updateOrderStatus: vi.fn(),
}))
vi.mock('../api/platforms', () => ({ fetchPlatforms: vi.fn() }))

const mockedFetchOrders = vi.mocked(ordersApi.fetchOrders)
const mockedFetchOrderDetail = vi.mocked(ordersApi.fetchOrderDetail)
const mockedUpdateStatus = vi.mocked(ordersApi.updateOrderStatus)
const mockedFetchPlatforms = vi.mocked(platformsApi.fetchPlatforms)

function buildPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    id: 'platform-1',
    platform_name: 'shopee',
    shop_id_external: 'MOCK-SHOP-SHOPEE',
    token_expires_at: null,
    is_connected: true,
    last_synced_at: null,
    last_sync_status: null,
    configured: true,
    ...overrides,
  }
}

function buildOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'order-1',
    platform_id: 'platform-1',
    external_order_id: 'SP-991',
    customer_id: null,
    status: 'new',
    sla_type: 'instant',
    sla_deadline: new Date(Date.now() + 3600_000).toISOString(),
    total_amount: 36000,
    received_at: new Date().toISOString(),
    payment_method: 'cod',
    shipping_address_snapshot: { address: 'Jl. Melati No. 5' },
    raw_payload: {},
    items: [{ id: 'item-1', product_id: null, external_item_ref: null, item_name_snapshot: 'Kopi Susu', qty: 2, unit_price: 18000 }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedFetchPlatforms.mockResolvedValue([buildPlatform()])
})

describe('OrdersPage', () => {
  it('order tampil sebagai kartu sendiri, item-nya langsung kelihatan (gak perlu diklik)', async () => {
    const order = buildOrder()
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    render(<OrdersPage />)

    expect(await screen.findByText('SP-991', { exact: false })).toBeInTheDocument()
    expect(screen.getAllByText('shopee', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Baru').length).toBeGreaterThan(0)
    // Item beserta qty & subtotal (2 x 18.000 = 36.000) langsung tampil di kartu.
    expect(screen.getByText('Kopi Susu', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('x2', { exact: false })).toBeInTheDocument()
    expect(screen.getAllByText(/Rp\s*36\.000/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Pembayaran: cod/)).toBeInTheDocument()
    expect(screen.getByText(/Alamat: Jl\. Melati No\. 5/)).toBeInTheDocument()
  })

  it('order dengan SLA lewat deadline -- ditandai "(lewat)"', async () => {
    const order = buildOrder({ sla_deadline: new Date(Date.now() - 3600_000).toISOString(), status: 'processing' })
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    render(<OrdersPage />)

    expect(await screen.findByText(/\(lewat\)/)).toBeInTheDocument()
  })

  it('order SELESAI yang deadline-nya udah lewat TIDAK ditandai "(lewat)" lagi', async () => {
    const order = buildOrder({ sla_deadline: new Date(Date.now() - 3600_000).toISOString(), status: 'completed' })
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    render(<OrdersPage />)

    await screen.findByText('SP-991', { exact: false })
    expect(screen.queryByText(/\(lewat\)/)).not.toBeInTheDocument()
  })

  it('daftar kosong -- empty state', async () => {
    mockedFetchOrders.mockResolvedValue([])
    render(<OrdersPage />)

    expect(await screen.findByText('Gak ada order')).toBeInTheDocument()
  })

  it('gagal load -- pesan error dari backend', async () => {
    mockedFetchOrders.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'Server lagi down.'))
    render(<OrdersPage />)

    expect(await screen.findByText('Server lagi down.')).toBeInTheDocument()
  })

  it('ganti filter status -- fetchOrders dipanggil ulang dengan filter yang benar', async () => {
    const user = userEvent.setup()
    const order = buildOrder()
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    render(<OrdersPage />)
    await screen.findByText('SP-991', { exact: false })

    await user.selectOptions(screen.getByLabelText('Status'), 'processing')

    await waitFor(() =>
      expect(mockedFetchOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'processing', platform_id: undefined, sla_type: undefined }),
      ),
    )
  })

  it('ubah status langsung dari dropdown di kartu -- manggil updateOrderStatus', async () => {
    const user = userEvent.setup()
    const order = buildOrder()
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    mockedUpdateStatus.mockResolvedValue({ ...order, status: 'processing' })
    render(<OrdersPage />)
    await screen.findByText('SP-991', { exact: false })

    await user.selectOptions(screen.getByRole('combobox', { name: '' }), 'processing')

    await waitFor(() => expect(mockedUpdateStatus).toHaveBeenCalledWith('order-1', 'processing'))
  })

  it('order tanpa alamat pengiriman -- baris Alamat gak dirender sama sekali', async () => {
    const order = buildOrder({ shipping_address_snapshot: null })
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    render(<OrdersPage />)

    await screen.findByText('SP-991', { exact: false })
    expect(screen.queryByText(/Alamat:/)).not.toBeInTheDocument()
  })

  it('dua order -- dua kartu terpisah, item masing-masing gak ketuker', async () => {
    const orderA = buildOrder({ id: 'order-1', external_order_id: 'SP-991', items: [{ id: 'i1', product_id: null, external_item_ref: null, item_name_snapshot: 'Kopi Susu', qty: 1, unit_price: 18000 }] })
    const orderB = buildOrder({ id: 'order-2', external_order_id: 'SP-992', items: [{ id: 'i2', product_id: null, external_item_ref: null, item_name_snapshot: 'Roti Bakar', qty: 3, unit_price: 15000 }] })
    mockedFetchOrders.mockResolvedValue([orderA, orderB])
    mockedFetchOrderDetail.mockImplementation((id) => Promise.resolve(id === 'order-1' ? orderA : orderB))
    render(<OrdersPage />)

    expect(await screen.findByText('Kopi Susu', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Roti Bakar', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('SP-991', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('SP-992', { exact: false })).toBeInTheDocument()
  })
})
