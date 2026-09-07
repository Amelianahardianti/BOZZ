import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ordersApi from '../../../api/orders'
import type { OrderDetail } from '../../../api/orders'
import * as platformsApi from '../../../api/platforms'
import type { Platform } from '../../../api/platforms'
import * as staffApi from '../../../api/staff'
import type { Staff } from '../../../api/staff'
import { ApiRequestError } from '../../../api/client'
import { OrdersPage } from '../OrdersPage'

// OrdersPage pakai useNavigate() (tombol "Lihat Ticket") -- butuh Router
// context. Dipakai createMemoryRouter (bukan MemoryRouter polos) + rute
// "/tickets" stub supaya test "Lihat Ticket" (Task 4, K.7) bisa
// membuktikan navigasi beneran nyampe ke /tickets lewat
// router.state.location.pathname, pola sama kayak router.test.tsx.
function renderOrdersPage() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <OrdersPage /> },
      { path: '/tickets', element: <p>Halaman Ticket (stub)</p> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

vi.mock('../../../api/orders', () => ({
  fetchOrders: vi.fn(),
  fetchOrderDetail: vi.fn(),
  updateOrderStatus: vi.fn(),
}))
vi.mock('../../../api/platforms', () => ({ fetchPlatforms: vi.fn() }))
// Sebelum Task 4 gak di-mock (dibiarkan gagal diam-diam lewat .catch()
// di OrdersPage) karena gak ada assertion yang butuh nama staf beneran.
// Section "Status Packing" (Task 4) butuh nama pengepak yang benar,
// jadi di-mock eksplisit di sini sekarang.
vi.mock('../../../api/staff', () => ({ fetchStaff: vi.fn() }))

const mockedFetchOrders = vi.mocked(ordersApi.fetchOrders)
const mockedFetchOrderDetail = vi.mocked(ordersApi.fetchOrderDetail)
const mockedUpdateStatus = vi.mocked(ordersApi.updateOrderStatus)
const mockedFetchPlatforms = vi.mocked(platformsApi.fetchPlatforms)
const mockedFetchStaff = vi.mocked(staffApi.fetchStaff)

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
    ticket: null,
    ...overrides,
  }
}

function buildStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: 'pengepak-1',
    name: 'konenggg',
    email_or_username: 'konenggg',
    role: 'pengepak',
    phone: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedFetchPlatforms.mockResolvedValue([buildPlatform()])
  mockedFetchStaff.mockResolvedValue([])
})

describe('OrdersPage', () => {
  it('order tampil sebagai kartu sendiri, item-nya langsung kelihatan (gak perlu diklik)', async () => {
    const order = buildOrder()
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    renderOrdersPage()

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
    renderOrdersPage()

    expect(await screen.findByText(/\(lewat\)/)).toBeInTheDocument()
  })

  it('order SELESAI yang deadline-nya udah lewat TIDAK ditandai "(lewat)" lagi', async () => {
    const order = buildOrder({ sla_deadline: new Date(Date.now() - 3600_000).toISOString(), status: 'completed' })
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    renderOrdersPage()

    await screen.findByText('SP-991', { exact: false })
    expect(screen.queryByText(/\(lewat\)/)).not.toBeInTheDocument()
  })

  it('daftar kosong -- empty state', async () => {
    mockedFetchOrders.mockResolvedValue([])
    renderOrdersPage()

    expect(await screen.findByText('Gak ada order')).toBeInTheDocument()
  })

  it('gagal load -- pesan error dari backend', async () => {
    mockedFetchOrders.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'Server lagi down.'))
    renderOrdersPage()

    expect(await screen.findByText('Server lagi down.')).toBeInTheDocument()
  })

  it('ganti filter status -- fetchOrders dipanggil ulang dengan filter yang benar', async () => {
    const user = userEvent.setup()
    const order = buildOrder()
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    renderOrdersPage()
    await screen.findByText('SP-991', { exact: false })

    await user.selectOptions(screen.getByLabelText('Status'), 'processing')

    await waitFor(() =>
      expect(mockedFetchOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'processing', platform_id: undefined, sla_type: undefined }),
      ),
    )
  })

  it('status Baru -- tombol "Mulai Diproses" manggil updateOrderStatus(id, processing)', async () => {
    const user = userEvent.setup()
    const order = buildOrder({ status: 'new' })
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    mockedUpdateStatus.mockResolvedValue({ ...order, status: 'processing' })
    renderOrdersPage()
    await screen.findByText('SP-991', { exact: false })

    // Dropdown bebas (bisa Completed->New atau New->Completed langsung)
    // DIHAPUS Task 3 -- diganti guided action, cuma SATU tombol yang
    // relevan buat status saat ini.
    expect(screen.queryByRole('combobox', { name: 'Ubah status order' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Mulai Diproses/ }))

    await waitFor(() => expect(mockedUpdateStatus).toHaveBeenCalledWith('order-1', 'processing'))
  })

  describe('Update Status gagal -- inline error, bukan window.alert (Task 6)', () => {
    it('API gagal -- TIDAK window.alert, error tampil inline dekat tombol', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const user = userEvent.setup()
      const order = buildOrder({ status: 'new' })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      mockedUpdateStatus.mockRejectedValueOnce(new ApiRequestError(409, 'CONFLICT', 'Order berstatus "new" tidak bisa langsung diubah.'))
      renderOrdersPage()

      await user.click(await screen.findByRole('button', { name: /Mulai Diproses/ }))

      expect(await screen.findByText('Order berstatus "new" tidak bisa langsung diubah.')).toBeInTheDocument()
      expect(alertSpy).not.toHaveBeenCalled()
      // Order tetap di kartu yang sama (tidak page reload/redirect) -- retry masih tersedia.
      expect(screen.getByRole('button', { name: /Mulai Diproses/ })).toBeInTheDocument()

      alertSpy.mockRestore()
    })

    it('error non-ApiRequestError -- fallback Bahasa Indonesia', async () => {
      const user = userEvent.setup()
      const order = buildOrder({ status: 'new' })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      mockedUpdateStatus.mockRejectedValueOnce(new Error('network boom'))
      renderOrdersPage()

      await user.click(await screen.findByRole('button', { name: /Mulai Diproses/ }))

      expect(await screen.findByText('Gagal mengubah status pesanan.')).toBeInTheDocument()
    })

    it('retry -- klik lagi membersihkan error lama sebelum request baru, sukses menghapus errornya', async () => {
      const user = userEvent.setup()
      const order = buildOrder({ status: 'new' })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      mockedUpdateStatus
        .mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'Server lagi down.'))
        .mockResolvedValueOnce({ ...order, status: 'processing' })
      renderOrdersPage()

      await user.click(await screen.findByRole('button', { name: /Mulai Diproses/ }))
      expect(await screen.findByText('Server lagi down.')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Mulai Diproses/ }))

      await waitFor(() => expect(mockedUpdateStatus).toHaveBeenCalledTimes(2))
      expect(screen.queryByText('Server lagi down.')).not.toBeInTheDocument()
    })
  })

  describe('guided action per status (Task 3)', () => {
    it('status Diproses, belum ada ticket -- tombol "Buat Ticket" muncul, TIDAK ada "Mulai Diproses" lagi', async () => {
      const order = buildOrder({ status: 'processing', ticket: null })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      renderOrdersPage()

      expect(await screen.findByRole('button', { name: /Buat Ticket/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Mulai Diproses/ })).not.toBeInTheDocument()
    })

    it('status Diproses, ticket sudah dibuat -- status packing & tombol "Lihat Ticket" muncul (section Status Packing, Task 4), bukan "Buat Ticket"', async () => {
      const order = buildOrder({
        status: 'processing',
        ticket: { id: 'ticket-1', status: 'assigned', assigned_to_user_id: 'pengepak-1' },
      })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      renderOrdersPage()

      expect(await screen.findByText('Menunggu Pengepakan')).toBeInTheDocument()
      // Satu-satunya tombol "Lihat Ticket" -- badge/tombol dobel di guided
      // action (Task 3) sudah dihapus, digantikan section Status Packing.
      expect(screen.getByRole('button', { name: /Lihat Ticket/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Buat Ticket/ })).not.toBeInTheDocument()
    })

    it('status Dikirim -- tombol "Tandai Selesai" manggil updateOrderStatus(id, completed)', async () => {
      const user = userEvent.setup()
      const order = buildOrder({ status: 'shipped' })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      mockedUpdateStatus.mockResolvedValue({ ...order, status: 'completed' })
      renderOrdersPage()

      await user.click(await screen.findByRole('button', { name: /Tandai Selesai/ }))

      await waitFor(() => expect(mockedUpdateStatus).toHaveBeenCalledWith('order-1', 'completed'))
    })

    it.each(['completed', 'cancelled'] as const)(
      'status terminal (%s) -- TIDAK ada action apa pun (completion disabled)',
      async (status) => {
        const order = buildOrder({ status })
        mockedFetchOrders.mockResolvedValue([order])
        mockedFetchOrderDetail.mockResolvedValue(order)
        renderOrdersPage()
        await screen.findByText('SP-991', { exact: false })

        expect(screen.queryByRole('button', { name: /Mulai Diproses/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Buat Ticket/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Lihat Ticket/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Tandai Selesai/ })).not.toBeInTheDocument()
      }
    )
  })

  describe('Status Packing di Order Card (Task 4)', () => {
    it.each([
      ['assigned', 'Menunggu Pengepakan'],
      ['packing', 'Sedang Dikemas'],
      ['packed', 'Packing Selesai'],
      ['handed_over', 'Diserahkan'],
    ] as const)('ticket status %s -- label "%s" tampil di section Status Packing', async (ticketStatus, label) => {
      const order = buildOrder({
        status: 'processing',
        ticket: { id: 'ticket-1', status: ticketStatus, assigned_to_user_id: 'pengepak-1' },
      })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      renderOrdersPage()

      expect(await screen.findByText('Status Packing')).toBeInTheDocument()
      expect(screen.getByText(label)).toBeInTheDocument()
    })

    it('nama pengepak yang ditugaskan tampil (resolve dari fetchStaff, sama kayak TicketsPage.tsx)', async () => {
      const order = buildOrder({
        status: 'processing',
        ticket: { id: 'ticket-1', status: 'packing', assigned_to_user_id: 'pengepak-1' },
      })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      mockedFetchStaff.mockResolvedValue([buildStaff({ id: 'pengepak-1', name: 'konenggg' })])
      renderOrdersPage()

      expect(await screen.findByText(/Pengepak:/)).toBeInTheDocument()
      expect(await screen.findByText(/konenggg/)).toBeInTheDocument()
    })

    it('ticket belum ada pengepak (assigned_to_user_id null) -- fallback "Belum ditugaskan", BUKAN blank/error', async () => {
      const order = buildOrder({
        status: 'processing',
        ticket: { id: 'ticket-1', status: 'assigned', assigned_to_user_id: null },
      })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      renderOrdersPage()

      expect(await screen.findByText(/Pengepak:/)).toBeInTheDocument()
      expect(screen.getByText(/Belum ditugaskan/)).toBeInTheDocument()
    })

    it('klik "Lihat Ticket" navigasi ke halaman Ticket (/tickets, routing existing)', async () => {
      const user = userEvent.setup()
      const order = buildOrder({
        status: 'processing',
        ticket: { id: 'ticket-1', status: 'packed', assigned_to_user_id: 'pengepak-1' },
      })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      const router = renderOrdersPage()

      await user.click(await screen.findByRole('button', { name: /Lihat Ticket/ }))

      expect(router.state.location.pathname).toBe('/tickets')
    })

    it('order BELUM punya ticket -- section "Status Packing" TIDAK muncul sama sekali', async () => {
      const order = buildOrder({ status: 'processing', ticket: null })
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      renderOrdersPage()

      await screen.findByRole('button', { name: /Buat Ticket/ })
      expect(screen.queryByText('Status Packing')).not.toBeInTheDocument()
    })
  })

  it('order tanpa alamat pengiriman -- baris Alamat gak dirender sama sekali', async () => {
    const order = buildOrder({ shipping_address_snapshot: null })
    mockedFetchOrders.mockResolvedValue([order])
    mockedFetchOrderDetail.mockResolvedValue(order)
    renderOrdersPage()

    await screen.findByText('SP-991', { exact: false })
    expect(screen.queryByText(/Alamat:/)).not.toBeInTheDocument()
  })

  it('dua order -- dua kartu terpisah, item masing-masing gak ketuker', async () => {
    const orderA = buildOrder({ id: 'order-1', external_order_id: 'SP-991', items: [{ id: 'i1', product_id: null, external_item_ref: null, item_name_snapshot: 'Kopi Susu', qty: 1, unit_price: 18000 }] })
    const orderB = buildOrder({ id: 'order-2', external_order_id: 'SP-992', items: [{ id: 'i2', product_id: null, external_item_ref: null, item_name_snapshot: 'Roti Bakar', qty: 3, unit_price: 15000 }] })
    mockedFetchOrders.mockResolvedValue([orderA, orderB])
    mockedFetchOrderDetail.mockImplementation((id) => Promise.resolve(id === 'order-1' ? orderA : orderB))
    renderOrdersPage()

    expect(await screen.findByText('Kopi Susu', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Roti Bakar', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('SP-991', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('SP-992', { exact: false })).toBeInTheDocument()
  })

  describe('pagination', () => {
    it('default: page 1, limit 10; tombol Sebelumnya kedisable di halaman 1', async () => {
      const order = buildOrder()
      mockedFetchOrders.mockResolvedValue([order])
      mockedFetchOrderDetail.mockResolvedValue(order)
      renderOrdersPage()
      await screen.findByText('SP-991', { exact: false })

      expect(mockedFetchOrders).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }))
      expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeDisabled()
    })

    it('hasil sepenuh pageSize -- tombol Berikutnya aktif, klik pindah ke page 2', async () => {
      const user = userEvent.setup()
      // 10 hasil == pageSize default (10) -- artinya KEMUNGKINAN masih ada halaman berikutnya.
      mockedFetchOrders.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => buildOrder({ id: `o${i}`, external_order_id: `SP-${i}` })),
      )
      mockedFetchOrderDetail.mockImplementation((id) => Promise.resolve(buildOrder({ id, external_order_id: id })))
      renderOrdersPage()
      await screen.findByText('Halaman 1')
      expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeEnabled()

      await user.click(screen.getByRole('button', { name: 'Berikutnya' }))

      await waitFor(() => expect(mockedFetchOrders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
      expect(await screen.findByText('Halaman 2')).toBeInTheDocument()
    })

    it('hasil kurang dari pageSize -- tombol Berikutnya kedisable (dianggap halaman terakhir)', async () => {
      const order = buildOrder()
      mockedFetchOrders.mockResolvedValue([order]) // 1 hasil < pageSize (10)
      mockedFetchOrderDetail.mockResolvedValue(order)
      renderOrdersPage()

      await screen.findByText('SP-991', { exact: false })
      expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeDisabled()
    })

    it('ganti filter -- balik lagi ke halaman 1', async () => {
      const user = userEvent.setup()
      const order = buildOrder()
      mockedFetchOrders.mockResolvedValue(Array.from({ length: 10 }, (_, i) => buildOrder({ id: `o${i}`, external_order_id: `SP-${i}` })))
      mockedFetchOrderDetail.mockImplementation((id) => Promise.resolve(buildOrder({ id, external_order_id: id })))
      renderOrdersPage()
      await screen.findByText('Halaman 1')

      await user.click(screen.getByRole('button', { name: 'Berikutnya' }))
      await screen.findByText('Halaman 2')

      mockedFetchOrders.mockResolvedValue([order])
      await user.selectOptions(screen.getByLabelText('Status'), 'processing')

      expect(await screen.findByText('Halaman 1')).toBeInTheDocument()
      await waitFor(() => expect(mockedFetchOrders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: 'processing' })))
    })
  })
})
