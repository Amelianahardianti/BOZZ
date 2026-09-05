import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../../api/auth'
import * as notificationsApi from '../../api/notifications'
import { AuthProvider } from '../auth/AuthProvider'
import { STORAGE_KEY, type AuthSession } from '../auth/auth-context'
import { routeConfig } from './router'
import { NAV_ITEMS, ROUTES, type AppRole } from './routes'

vi.mock('../../api/auth')
// AppShell (dirender di setiap rute berlogin) manggil useUnreadNotifications
// buat badge di nav -- di-mock di sini biar test routing gak diam-diam
// nembak fetch() beneran ke jaringan.
vi.mock('../../api/notifications', () => ({ fetchNotifications: vi.fn() }))

const mockedFetchNotifications = vi.mocked(notificationsApi.fetchNotifications)

function sessionFor(role: AppRole): AuthSession {
  return {
    token: `tok-${role}`,
    user: { id: `id-${role}`, name: `Uji ${role}`, email_or_username: role, role, phone: null, is_active: true },
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockedFetchNotifications.mockResolvedValue([])
})

/**
 * Render rute PERSIS yang jalan di production (routeConfig), cuma
 * history-nya diganti ke memory router biar bisa dites tanpa browser.
 * `role` -- kalau diisi, disimulasikan sudah login sebagai role itu
 * (lewat localStorage, dibaca AuthProvider pas mount); kalau
 * dikosongkan, disimulasikan BELUM login sama sekali.
 */
function renderAt(path: string, role?: AppRole) {
  if (role) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionFor(role)))
  }
  const router = createMemoryRouter(routeConfig, { initialEntries: [path] })
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  )
  return router
}

describe('routing dasar', () => {
  it('path yang gak dikenal nampilin halaman 404', () => {
    renderAt('/halaman-ngawur', 'owner')

    expect(screen.getByText('404')).toBeInTheDocument()
  })
})

describe('RequireAuth -- lapis pertama: harus login dulu', () => {
  it('"/" TANPA login dilempar ke /login', async () => {
    const router = renderAt('/')

    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.login)
  })

  it('rute di dalam shell (mis. /dashboard) TANPA login dilempar ke /login', async () => {
    renderAt(ROUTES.dashboard)

    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeInTheDocument()
  })

  it('halaman /login TANPA login tampil TANPA nav shell', () => {
    renderAt(ROUTES.login)

    expect(screen.getByRole('heading', { name: 'Masuk' })).toBeInTheDocument()
    // Nav cuma ada di AppShell -- kalau ini muncul di halaman login,
    // berarti Login ketimpa di dalam shell padahal harus berdiri sendiri.
    expect(screen.queryByRole('link', { name: 'Kasir' })).not.toBeInTheDocument()
  })

  it('/login SUDAH login gak nampilin form lagi, langsung dialihkan', async () => {
    renderAt(ROUTES.login, 'owner')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('"/" SUDAH login (owner) diarahkan ke Dashboard', async () => {
    renderAt('/', 'owner')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})

describe('RequireRole -- lapis kedua: role harus sesuai hak akses (SRS 2.2)', () => {
  it.each(NAV_ITEMS)('Owner bisa buka halaman "$label" ($path)', async ({ path, label }) => {
    renderAt(path, 'owner')

    expect(await screen.findAllByText(label)).not.toHaveLength(0)
  })

  it('Kasir buka /dashboard (bukan haknya) -> dialihkan ke /kasir', async () => {
    const router = renderAt(ROUTES.dashboard, 'kasir')

    expect(await screen.findByRole('heading', { name: 'Kasir' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.kasir)
  })

  it('Kasir buka halaman Kasir/POS -- boleh', async () => {
    renderAt(ROUTES.kasir, 'kasir')

    expect(await screen.findByRole('heading', { name: 'Kasir' })).toBeInTheDocument()
  })

  it('Pengepak buka /kasir (bukan haknya) -> dialihkan ke /tickets (Ticket Saya)', async () => {
    const router = renderAt(ROUTES.kasir, 'pengepak')

    expect(await screen.findByRole('heading', { name: 'Ticket Saya' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.tickets)
  })

  it('Pengepak buka Ticket Saya -- boleh', async () => {
    renderAt(ROUTES.tickets, 'pengepak')

    expect(await screen.findByRole('heading', { name: 'Ticket Saya' })).toBeInTheDocument()
  })

  it('"/" buat Kasir diarahkan ke /kasir, BUKAN /dashboard', async () => {
    const router = renderAt('/', 'kasir')

    await screen.findByRole('heading', { name: 'Kasir' })
    expect(router.state.location.pathname).toBe(ROUTES.kasir)
  })

  it('"/" buat Pengepak diarahkan ke /tickets, BUKAN /dashboard', async () => {
    const router = renderAt('/', 'pengepak')

    await screen.findByRole('heading', { name: 'Ticket Saya' })
    expect(router.state.location.pathname).toBe(ROUTES.tickets)
  })
})

describe('Nav shell cuma nampilin menu sesuai hak akses role (SRS 2.2)', () => {
  it('Kasir cuma lihat menu Kasir & Notifikasi', async () => {
    renderAt(ROUTES.kasir, 'kasir')
    await screen.findByRole('heading', { name: 'Kasir' })

    expect(screen.getAllByRole('link', { name: 'Kasir' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Notifikasi' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Staf' })).not.toBeInTheDocument()
  })

  it('Pengepak cuma lihat menu Ticket Saya & Notifikasi', async () => {
    renderAt(ROUTES.tickets, 'pengepak')
    await screen.findByRole('heading', { name: 'Ticket Saya' })

    expect(screen.getAllByRole('link', { name: 'Ticket Saya' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Kasir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Produk' })).not.toBeInTheDocument()
  })

  it('Owner lihat semua menu', async () => {
    renderAt(ROUTES.dashboard, 'owner')
    await screen.findByRole('heading', { name: 'Dashboard' })

    for (const item of NAV_ITEMS) {
      expect(screen.getAllByRole('link', { name: item.label }).length).toBeGreaterThan(0)
    }
  })

  it('klik nav link (sebagai owner) beneran pindah halaman', async () => {
    const router = renderAt(ROUTES.dashboard, 'owner')
    await screen.findByRole('heading', { name: 'Dashboard' })

    const [ticketLink] = screen.getAllByRole('link', { name: 'Ticket Saya' })
    await userEvent.click(ticketLink)

    expect(await screen.findByRole('heading', { name: 'Ticket Saya' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.tickets)
  })
})

describe('Pengaturan -- satu menu, dua sub-tab (Toko & Staf)', () => {
  it('cuma ada SATU link "Pengaturan" di nav, bukan dua link terpisah', async () => {
    renderAt(ROUTES.dashboard, 'owner')
    await screen.findByRole('heading', { name: 'Dashboard' })

    expect(screen.getAllByRole('link', { name: 'Pengaturan' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Staf' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Pengaturan Toko' })).not.toBeInTheDocument()
  })

  it('/settings dialihkan ke /settings/store (tab Toko default)', async () => {
    const router = renderAt(ROUTES.settings, 'owner')

    expect(await screen.findByRole('heading', { name: 'Pengaturan Toko' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.storeSettings)
  })

  it('klik tab "Staf" pindah ke /settings/staff tanpa keluar dari Pengaturan', async () => {
    const user = userEvent.setup()
    const router = renderAt(ROUTES.settings, 'owner')
    await screen.findByRole('heading', { name: 'Pengaturan Toko' })

    await user.click(screen.getByRole('link', { name: 'Staf' }))

    expect(await screen.findByRole('heading', { name: 'Staf' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.staff)
    // Tab "Toko" masih ada buat balik lagi -- bukan ilang abis pindah tab.
    expect(screen.getByRole('link', { name: 'Toko' })).toBeInTheDocument()
  })

  it('Kasir/Pengepak gak bisa akses /settings/staff sama sekali (dialihkan ke halaman defaultnya)', async () => {
    const router = renderAt(ROUTES.staff, 'kasir')

    await screen.findByRole('heading', { name: 'Kasir' })
    expect(router.state.location.pathname).toBe(ROUTES.kasir)
  })
})

describe('Alur "kena lempar ke login, balik lagi ke halaman tujuan"', () => {
  it('coba akses /staff tanpa login -> login -> balik ke /staff (bukan ke halaman default)', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionFor('owner'))

    const router = renderAt(ROUTES.staff)
    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Username / Email'), 'owner')
    await userEvent.type(screen.getByLabelText('Password'), 'owner123')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    expect(await screen.findByRole('heading', { name: 'Staf' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.staff)
  })
})

describe('Badge notifikasi belum dibaca di nav (AppShell)', () => {
  it('ada notifikasi belum dibaca -- badge nampilin jumlahnya di link "Notifikasi"', async () => {
    mockedFetchNotifications.mockResolvedValue([
      { id: '1', user_id: 'x', type: 'x', title: 'x', message: null, reference_type: null, reference_id: null, is_read: false, created_at: new Date().toISOString() },
      { id: '2', user_id: 'x', type: 'x', title: 'x', message: null, reference_type: null, reference_id: null, is_read: false, created_at: new Date().toISOString() },
    ])
    renderAt(ROUTES.dashboard, 'owner')
    await screen.findByRole('heading', { name: 'Dashboard' })

    expect((await screen.findAllByText('2')).length).toBeGreaterThan(0)
  })

  it('gak ada notifikasi belum dibaca -- gak ada badge sama sekali', async () => {
    mockedFetchNotifications.mockResolvedValue([])
    renderAt(ROUTES.dashboard, 'owner')
    await screen.findByRole('heading', { name: 'Dashboard' })

    // Notifikasi tetap ada sebagai link, cuma tanpa angka badge nempel.
    expect(screen.getAllByRole('link', { name: 'Notifikasi' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
