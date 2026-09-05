import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeJwt } from '../../../test/fixtures'
import { AuthProvider } from '../AuthProvider'
import { notifyUnauthorized, STORAGE_KEY } from '../auth-context'
import { useAuth } from '../useAuth'

function Probe({ token = 'tok-1' }: { token?: string }) {
  const { session, login, logout } = useAuth()
  return (
    <div>
      <p>{session ? `login:${session.user.name}` : 'logged-out'}</p>
      <button
        onClick={() =>
          login({
            token,
            user: {
              id: '1',
              name: 'Owner Toko',
              email_or_username: 'owner',
              role: 'owner',
              phone: null,
              is_active: true,
            },
          })
        }
      >
        login
      </button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('AuthProvider / useAuth', () => {
  it('mulai dari logged-out kalau localStorage kosong', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(screen.getByText('logged-out')).toBeInTheDocument()
  })

  it('login() update state DAN nyimpen ke localStorage', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'login' }))

    expect(screen.getByText('login:Owner Toko')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toMatchObject({ token: 'tok-1' })
  })

  it('logout() bersihin state DAN localStorage', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'login' }))
    await userEvent.click(screen.getByRole('button', { name: 'logout' }))

    expect(screen.getByText('logged-out')).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('baca sesi yang udah ada di localStorage pas pertama kali mount (tetap login abis refresh)', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: 'tok-lama',
        user: {
          id: '9',
          name: 'Sudah Login',
          email_or_username: 'x',
          role: 'owner',
          phone: null,
          is_active: true,
        },
      }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(screen.getByText('login:Sudah Login')).toBeInTheDocument()
  })

  it('useAuth() dipanggil di luar AuthProvider lempar error yang jelas', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => render(<Probe />)).toThrow('useAuth() harus dipanggil di dalam <AuthProvider>')

    consoleErrorSpy.mockRestore()
  })
})

describe('AuthProvider -- sesi kedaluwarsa (auto-logout, default 8 jam sesuai JWT_EXPIRES_IN backend)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sesi di localStorage yang TOKEN-nya udah lewat exp gak dipulihin -- mulai dari logged-out', () => {
    const expiredToken = fakeJwt({ sub: '9', role: 'owner', exp: Math.floor(Date.now() / 1000) - 60 })
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: expiredToken,
        user: { id: '9', name: 'Sudah Expired', email_or_username: 'x', role: 'owner', phone: null, is_active: true },
      }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(screen.getByText('logged-out')).toBeInTheDocument()
    // Localstorage-nya juga ikut dibersihin (efek sync session->storage jalan pas mount).
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('sesi yang token-nya MASIH berlaku tetap dipulihin normal', () => {
    const validToken = fakeJwt({ sub: '9', role: 'owner', exp: Math.floor(Date.now() / 1000) + 3600 })
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: validToken,
        user: { id: '9', name: 'Masih Aktif', email_or_username: 'x', role: 'owner', phone: null, is_active: true },
      }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(screen.getByText('login:Masih Aktif')).toBeInTheDocument()
  })

  it('auto-logout TEPAT pas token kedaluwarsa (timer), tanpa perlu interaksi apa pun', async () => {
    const eightHoursMs = 8 * 60 * 60 * 1000
    const token = fakeJwt({ sub: '1', role: 'owner', exp: Math.floor((Date.now() + eightHoursMs) / 1000) })

    render(
      <AuthProvider>
        <Probe token={token} />
      </AuthProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    expect(screen.getByText(/^login:/)).toBeInTheDocument()

    // Sedikit sebelum expiry -- harus masih login.
    await act(() => vi.advanceTimersByTimeAsync(eightHoursMs - 1000))
    expect(screen.getByText(/^login:/)).toBeInTheDocument()

    // Lewat titik expiry -- auto-logout, gak perlu klik apa pun.
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(screen.getByText('logged-out')).toBeInTheDocument()
  })

  it('event unauthorized (dari 401 backend) langsung logout, gak nunggu timer', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'login' }))
    expect(screen.getByText(/^login:/)).toBeInTheDocument()

    act(() => {
      notifyUnauthorized()
    })

    expect(screen.getByText('logged-out')).toBeInTheDocument()
  })
})
