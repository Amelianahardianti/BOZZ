import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../../../api/auth'
import { ApiRequestError } from '../../../api/client'
import { AuthProvider } from '../../../shell/auth/AuthProvider'
import { LoginPage } from '../LoginPage'

vi.mock('../../../api/auth')

function renderLoginPage() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/dashboard', element: <p>Halaman Dashboard</p> },
      { path: '/kasir', element: <p>Halaman Kasir</p> },
    ],
    { initialEntries: ['/login'] },
  )

  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )

  return router
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('LoginPage', () => {
  it('berhasil login lalu diarahkan ke halaman default rolenya (owner -> dashboard)', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      token: 'token-owner',
      user: {
        id: '1',
        name: 'Owner Toko',
        email_or_username: 'owner',
        role: 'owner',
        phone: null,
        is_active: true,
      },
    })

    renderLoginPage()

    await userEvent.type(screen.getByLabelText('Username'), 'owner')
    await userEvent.type(screen.getByLabelText('Password'), 'owner123')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    expect(await screen.findByText('Halaman Dashboard')).toBeInTheDocument()
    expect(authApi.login).toHaveBeenCalledWith('owner', 'owner123')
  })

  it('kasir diarahkan ke halaman Kasir, BUKAN Dashboard (SRS 2.2, hak akses per role)', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      token: 'token-kasir',
      user: {
        id: '2',
        name: 'Budi Kasir',
        email_or_username: 'budi',
        role: 'kasir',
        phone: null,
        is_active: true,
      },
    })

    renderLoginPage()

    await userEvent.type(screen.getByLabelText('Username'), 'budi')
    await userEvent.type(screen.getByLabelText('Password'), 'budi123')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    expect(await screen.findByText('Halaman Kasir')).toBeInTheDocument()
  })

  it('nampilin pesan error kalau login gagal, dan TETAP di halaman login', async () => {
    vi.mocked(authApi.login).mockRejectedValue(
      new ApiRequestError(401, 'INVALID_CREDENTIALS', 'Username atau password salah.'),
    )

    renderLoginPage()

    await userEvent.type(screen.getByLabelText('Username'), 'owner')
    await userEvent.type(screen.getByLabelText('Password'), 'salah-banget')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Username atau password salah.')
    expect(screen.getByRole('heading', { name: 'Masuk ke akun Anda' })).toBeInTheDocument()
  })
})
