import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as notificationsApi from '../../../api/notifications'
import type { Notification } from '../../../api/notifications'
import { AuthProvider } from '../../auth/AuthProvider'
import { STORAGE_KEY, type AuthSession } from '../../auth/auth-context'
import { notifyNotificationsChanged, useUnreadNotifications } from '../useUnreadNotifications'

vi.mock('../../../api/notifications', () => ({ fetchNotifications: vi.fn() }))

const mockedFetch = vi.mocked(notificationsApi.fetchNotifications)

const session: AuthSession = {
  token: 'token-owner-uji',
  user: { id: 'user-1', name: 'Owner', email_or_username: 'owner', role: 'owner', phone: null, is_active: true },
}

function unread(n: number): Notification[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `notif-${i}`,
    user_id: 'user-1',
    type: 'x',
    title: 'x',
    message: null,
    reference_type: null,
    reference_id: null,
    is_read: false,
    created_at: new Date().toISOString(),
  }))
}

function Probe() {
  const { count } = useUnreadNotifications()
  return <p>count: {count}</p>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('useUnreadNotifications', () => {
  it('gak ada sesi login -- count 0, gak manggil fetchNotifications sama sekali', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(await screen.findByText('count: 0')).toBeInTheDocument()
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('ada sesi login -- fetch is_read=false, count-nya sejumlah hasil', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    mockedFetch.mockResolvedValue(unread(3))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(await screen.findByText('count: 3')).toBeInTheDocument()
    expect(mockedFetch).toHaveBeenCalledWith({ is_read: false, limit: 100 })
  })

  it('fetch gagal -- count tetap 0, gak nge-crash', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    mockedFetch.mockRejectedValue(new Error('network error'))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await act(async () => {})
    expect(screen.getByText('count: 0')).toBeInTheDocument()
  })

  it('notifyNotificationsChanged() bikin instance LAIN ikut refresh -- gak perlu nunggu poll 30 detik', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    mockedFetch.mockResolvedValue(unread(2))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(await screen.findByText('count: 2')).toBeInTheDocument()

    // Simulasikan mark-as-read di komponen LAIN (mis. NotificationsPage) --
    // instance Probe di atas gak pernah manggil notifyNotificationsChanged
    // sendiri, tapi tetap harus ikut ke-refresh begitu instance lain manggil.
    mockedFetch.mockResolvedValue(unread(0))
    act(() => {
      notifyNotificationsChanged()
    })

    expect(await screen.findByText('count: 0')).toBeInTheDocument()
  })
})
