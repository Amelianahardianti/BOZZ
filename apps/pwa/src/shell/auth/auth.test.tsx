import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { STORAGE_KEY } from './auth-context'
import { useAuth } from './useAuth'

function Probe() {
  const { session, login, logout } = useAuth()
  return (
    <div>
      <p>{session ? `login:${session.user.name}` : 'logged-out'}</p>
      <button
        onClick={() =>
          login({
            token: 'tok-1',
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
