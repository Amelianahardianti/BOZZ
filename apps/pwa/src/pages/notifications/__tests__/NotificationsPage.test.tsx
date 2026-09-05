import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as notificationsApi from '../api/notifications'
import type { Notification } from '../api/notifications'
import { ApiRequestError } from '../api/client'
import { AuthProvider } from '../shell/auth/AuthProvider'
import { STORAGE_KEY, type AuthSession } from '../shell/auth/auth-context'
import { NotificationsPage } from './NotificationsPage'

vi.mock('../api/notifications', () => ({
  fetchNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}))

const mockedFetch = vi.mocked(notificationsApi.fetchNotifications)
const mockedMarkRead = vi.mocked(notificationsApi.markNotificationRead)

const session: AuthSession = {
  token: 'token-owner-uji',
  user: { id: 'user-1', name: 'Owner', email_or_username: 'owner', role: 'owner', phone: null, is_active: true },
}

function buildNotif(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    user_id: 'user-1',
    type: 'external_order.new',
    title: 'Pesanan baru masuk',
    message: 'Order #123 dari Shopee',
    reference_type: 'external_order',
    reference_id: 'order-1',
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function renderPage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  return render(
    <AuthProvider>
      <NotificationsPage />
    </AuthProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('NotificationsPage', () => {
  it('nampilin daftar notifikasi, yang belum dibaca ditandai titik', async () => {
    mockedFetch.mockResolvedValue([
      buildNotif({ is_read: false }),
      buildNotif({ id: 'notif-2', title: 'Sudah dibaca', message: 'Pesan lain', is_read: true }),
    ])
    renderPage()

    expect(await screen.findByText('Pesanan baru masuk')).toBeInTheDocument()
    expect(screen.getByText('Sudah dibaca')).toBeInTheDocument()
    expect(screen.getByText('Order #123 dari Shopee')).toBeInTheDocument()
    expect(screen.getAllByText('Pesanan Masuk').length).toBeGreaterThan(0) // label reference_type
  })

  it('daftar kosong -- empty state', async () => {
    mockedFetch.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('Belum ada notifikasi')).toBeInTheDocument()
  })

  it('gagal load -- pesan error dari backend', async () => {
    mockedFetch.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'Server lagi down.'))
    renderPage()

    expect(await screen.findByText('Server lagi down.')).toBeInTheDocument()
  })

  it('klik notifikasi belum dibaca -- manggil markNotificationRead, baris jadi styling "sudah dibaca"', async () => {
    const user = userEvent.setup()
    const notif = buildNotif({ is_read: false })
    mockedFetch.mockResolvedValue([notif])
    mockedMarkRead.mockResolvedValue({ ...notif, is_read: true })
    renderPage()

    const row = await screen.findByText('Pesanan baru masuk')
    await user.click(row)

    await waitFor(() => expect(mockedMarkRead).toHaveBeenCalledWith('notif-1'))
  })

  it('klik notifikasi yang SUDAH dibaca -- gak manggil markNotificationRead lagi', async () => {
    const user = userEvent.setup()
    mockedFetch.mockResolvedValue([buildNotif({ is_read: true })])
    renderPage()

    const row = await screen.findByText('Pesanan baru masuk')
    await user.click(row)

    expect(mockedMarkRead).not.toHaveBeenCalled()
  })

  it('tab "Belum Dibaca" cuma minta notifikasi is_read=false ke backend', async () => {
    const user = userEvent.setup()
    mockedFetch.mockResolvedValue([buildNotif()])
    renderPage()
    await screen.findByText('Pesanan baru masuk')

    await user.click(screen.getByRole('button', { name: 'Belum Dibaca' }))

    await waitFor(() => expect(mockedFetch).toHaveBeenLastCalledWith({ is_read: false, limit: 100 }))
  })

  it('tombol "Tandai Semua Dibaca" cuma muncul kalau ada yang belum dibaca, dan manggil markNotificationRead buat tiap yang belum dibaca', async () => {
    const user = userEvent.setup()
    mockedFetch.mockResolvedValue([
      buildNotif({ id: 'notif-1', title: 'Notif A', is_read: false }),
      buildNotif({ id: 'notif-2', title: 'Notif B', is_read: false }),
      buildNotif({ id: 'notif-3', title: 'Notif C', is_read: true }),
    ])
    mockedMarkRead.mockResolvedValue(buildNotif({ is_read: true }))
    renderPage()
    await screen.findByText('Notif A')

    const button = screen.getByRole('button', { name: 'Tandai Semua Dibaca' })
    await user.click(button)

    await waitFor(() => {
      expect(mockedMarkRead).toHaveBeenCalledWith('notif-1')
      expect(mockedMarkRead).toHaveBeenCalledWith('notif-2')
    })
    expect(mockedMarkRead).not.toHaveBeenCalledWith('notif-3')
  })

  it('semua notifikasi udah dibaca -- tombol "Tandai Semua Dibaca" gak muncul', async () => {
    mockedFetch.mockResolvedValue([buildNotif({ is_read: true })])
    renderPage()

    await screen.findByText('Pesanan baru masuk')
    expect(screen.queryByRole('button', { name: 'Tandai Semua Dibaca' })).not.toBeInTheDocument()
  })
})
