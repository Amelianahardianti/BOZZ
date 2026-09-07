import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../../../api/auth'
import * as notificationsApi from '../../../api/notifications'
import * as ordersApi from '../../../api/orders'
import * as platformsApi from '../../../api/platforms'
import { AuthProvider } from '../../auth/AuthProvider'
import { STORAGE_KEY, type AuthSession } from '../../auth/auth-context'
import * as productCache from '../../offline/productCache'
import * as storeSettingsCache from '../../offline/storeSettingsCache'
import { routeConfig } from '../router'
import { NAV_ITEMS, ROUTES, type AppRole } from '../routes'

vi.mock('../../../api/auth')
// AppShell (dirender di setiap rute berlogin) manggil useUnreadNotifications
// buat badge di nav -- di-mock di sini biar test routing gak diam-diam
// nembak fetch() beneran ke jaringan.
vi.mock('../../../api/notifications', () => ({ fetchNotifications: vi.fn() }))
// OrdersPage & PlatformsPage manggil ini pas mount (it.each(NAV_ITEMS) di
// bawah nyentuh SEMUA rute, termasuk keduanya) -- di-mock biar sama kayak
// alasan notifications di atas.
vi.mock('../../../api/orders', () => ({ fetchOrders: vi.fn() }))
vi.mock('../../../api/platforms', () => ({ fetchPlatforms: vi.fn() }))
// AppShell & KasirPage (rute /kasir, ikut disentuh it.each(NAV_ITEMS) di
// bawah) manggil syncProductCache()/syncStoreSettingsCache() pas mount,
// yang di baliknya nembak fetch() beneran ke API produk/store-settings --
// TIDAK ada hubungannya sama yang diuji file ini (routing/RBAC). Cuma
// fungsi sync-nya yang di-mock (tetap nembak network kalau tidak);
// getCachedProducts/getCachedCategories/getCachedStoreSettings TETAP versi
// asli (baca IndexedDB lewat fake-indexeddb, bukan network) supaya
// useLiveQuery() di AppShell/KasirPage tidak berubah perilaku.
vi.mock('../../offline/productCache', async () => {
  const actual = await vi.importActual<typeof import('../../offline/productCache')>('../../offline/productCache')
  return { ...actual, syncProductCache: vi.fn() }
})
vi.mock('../../offline/storeSettingsCache', async () => {
  const actual = await vi.importActual<typeof import('../../offline/storeSettingsCache')>('../../offline/storeSettingsCache')
  return { ...actual, syncStoreSettingsCache: vi.fn() }
})

const mockedFetchNotifications = vi.mocked(notificationsApi.fetchNotifications)
const mockedFetchOrders = vi.mocked(ordersApi.fetchOrders)
const mockedFetchPlatforms = vi.mocked(platformsApi.fetchPlatforms)
const mockedSyncProductCache = vi.mocked(productCache.syncProductCache)
const mockedSyncStoreSettingsCache = vi.mocked(storeSettingsCache.syncStoreSettingsCache)

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
  mockedFetchOrders.mockResolvedValue([])
  mockedFetchPlatforms.mockResolvedValue([])
  mockedSyncProductCache.mockResolvedValue(undefined)
  mockedSyncStoreSettingsCache.mockResolvedValue(undefined)
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

/**
 * Tunggu sampai routing (RequireAuth/RequireRole, redirect, dst) selesai
 * settle di path yang diharapkan. Dulu ini dites tidak langsung lewat
 * `findByRole('heading', ...)` (judul halaman di PageHeader konten) --
 * sejak PageHeader per-halaman dihapus (task "Simplifikasi Header
 * Content Page"), judul itu sudah tidak ada lagi buat sebagian rute,
 * jadi nunggunya sekarang LANGSUNG ke sumber kebenarannya: pathname
 * router itu sendiri.
 */
async function settledAt(router: ReturnType<typeof createMemoryRouter>, path: string) {
  await waitFor(() => expect(router.state.location.pathname).toBe(path))
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

    expect(await screen.findByRole('heading', { name: 'Masuk ke akun Anda' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.login)
  })

  it('rute di dalam shell (mis. /dashboard) TANPA login dilempar ke /login', async () => {
    renderAt(ROUTES.dashboard)

    expect(await screen.findByRole('heading', { name: 'Masuk ke akun Anda' })).toBeInTheDocument()
  })

  it('halaman /login TANPA login tampil TANPA nav shell', () => {
    renderAt(ROUTES.login)

    expect(screen.getByRole('heading', { name: 'Masuk ke akun Anda' })).toBeInTheDocument()
    // Nav cuma ada di AppShell -- kalau ini muncul di halaman login,
    // berarti Login ketimpa di dalam shell padahal harus berdiri sendiri.
    expect(screen.queryByRole('link', { name: 'Kasir' })).not.toBeInTheDocument()
  })

  it('/login SUDAH login gak nampilin form lagi, langsung dialihkan', async () => {
    const router = renderAt(ROUTES.login, 'owner')

    await settledAt(router, ROUTES.dashboard)
  })

  it('"/" SUDAH login (owner) diarahkan ke Dashboard', async () => {
    const router = renderAt('/', 'owner')

    await settledAt(router, ROUTES.dashboard)
  })
})

describe('RequireRole -- lapis kedua: role harus sesuai hak akses (SRS 2.2)', () => {
  it.each(NAV_ITEMS)('Owner bisa buka halaman "$label" ($path)', async ({ path, label }) => {
    renderAt(path, 'owner')

    expect(await screen.findAllByText(label)).not.toHaveLength(0)
  })

  it('Kasir buka /dashboard (bukan haknya) -> dialihkan ke /kasir', async () => {
    const router = renderAt(ROUTES.dashboard, 'kasir')

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ROUTES.kasir)
  })

  it('Kasir buka halaman Kasir/POS -- boleh', async () => {
    renderAt(ROUTES.kasir, 'kasir')

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
  })

  it('Pengepak buka /kasir (bukan haknya) -> dialihkan ke /tickets (Ticket Saya)', async () => {
    const router = renderAt(ROUTES.kasir, 'pengepak')

    await settledAt(router, ROUTES.tickets)
  })

  it('Pengepak buka Ticket Saya -- boleh', async () => {
    const router = renderAt(ROUTES.tickets, 'pengepak')

    await settledAt(router, ROUTES.tickets)
  })

  it('"/" buat Kasir diarahkan ke /kasir, BUKAN /dashboard', async () => {
    const router = renderAt('/', 'kasir')

    await screen.findByRole('searchbox')
    expect(router.state.location.pathname).toBe(ROUTES.kasir)
  })

  it('"/" buat Pengepak diarahkan ke /tickets, BUKAN /dashboard', async () => {
    const router = renderAt('/', 'pengepak')

    await settledAt(router, ROUTES.tickets)
  })
})

describe('Nav shell cuma nampilin menu sesuai hak akses role (SRS 2.2)', () => {
  it('Kasir cuma lihat menu Kasir', async () => {
    renderAt(ROUTES.kasir, 'kasir')
    await screen.findByRole('searchbox')

    expect(screen.getAllByRole('link', { name: 'Kasir' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Staf' })).not.toBeInTheDocument()
  })

  it('Pengepak cuma lihat menu Ticket Saya', async () => {
    const router = renderAt(ROUTES.tickets, 'pengepak')
    await settledAt(router, ROUTES.tickets)

    expect(screen.getAllByRole('link', { name: 'Ticket Saya' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Kasir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Produk' })).not.toBeInTheDocument()
  })

  it('Owner lihat semua menu', async () => {
    const router = renderAt(ROUTES.dashboard, 'owner')
    await settledAt(router, ROUTES.dashboard)

    for (const item of NAV_ITEMS) {
      expect(screen.getAllByRole('link', { name: item.label }).length).toBeGreaterThan(0)
    }
  })

  it('klik nav link (sebagai owner) beneran pindah halaman', async () => {
    const router = renderAt(ROUTES.dashboard, 'owner')
    await settledAt(router, ROUTES.dashboard)

    const [ticketLink] = screen.getAllByRole('link', { name: 'Ticket Saya' })
    await userEvent.click(ticketLink)

    await settledAt(router, ROUTES.tickets)
  })
})

describe('Pengaturan -- satu menu, dua sub-tab (Toko & Staf)', () => {
  it('cuma ada SATU link "Pengaturan" di nav, bukan dua link terpisah', async () => {
    const router = renderAt(ROUTES.dashboard, 'owner')
    await settledAt(router, ROUTES.dashboard)

    expect(screen.getAllByRole('link', { name: 'Pengaturan' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Staf' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Pengaturan Toko' })).not.toBeInTheDocument()
  })

  it('/settings dialihkan ke /settings/store (tab Toko default)', async () => {
    const router = renderAt(ROUTES.settings, 'owner')

    await settledAt(router, ROUTES.storeSettings)
    // Tab "Toko" aktif -- ini yang nunjukin sub-halaman mana yang lagi
    // tampil (PageHeader per-halaman sudah dihapus, top header cuma
    // nunjukin label generik "Pengaturan" buat kedua sub-tab).
    expect(await screen.findByRole('link', { name: 'Toko' })).toHaveAttribute('aria-current', 'page')
  })

  it('klik tab "Staf" pindah ke /settings/staff tanpa keluar dari Pengaturan', async () => {
    const user = userEvent.setup()
    const router = renderAt(ROUTES.settings, 'owner')
    await settledAt(router, ROUTES.storeSettings)

    await user.click(screen.getByRole('link', { name: 'Staf' }))
    await settledAt(router, ROUTES.staff)

    expect(await screen.findByRole('link', { name: 'Staf' })).toHaveAttribute('aria-current', 'page')
    // Tab "Toko" masih ada buat balik lagi -- bukan ilang abis pindah tab.
    expect(screen.getByRole('link', { name: 'Toko' })).toBeInTheDocument()
  })

  it('Kasir/Pengepak gak bisa akses /settings/staff sama sekali (dialihkan ke halaman defaultnya)', async () => {
    const router = renderAt(ROUTES.staff, 'kasir')

    await screen.findByRole('searchbox')
    expect(router.state.location.pathname).toBe(ROUTES.kasir)
  })
})

describe('Alur "kena lempar ke login, abis login SELALU ke default role (bukan balik ke halaman tujuan)"', () => {
  it('coba akses /staff tanpa login -> login -> ke Dashboard (default role Owner), BUKAN balik ke /staff', async () => {
    vi.mocked(authApi.login).mockResolvedValue(sessionFor('owner'))

    const router = renderAt(ROUTES.staff)
    expect(await screen.findByRole('heading', { name: 'Masuk ke akun Anda' })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Username'), 'owner')
    await userEvent.type(screen.getByLabelText('Password'), 'owner123')
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    await settledAt(router, ROUTES.dashboard)
  })
})

// Describe block "Badge notifikasi belum dibaca di nav (AppShell)" DIHAPUS
// (bukan diskip) -- satu-satunya yang diuji di situ adalah link nav
// "Notifikasi" (getAllByRole('link', { name: 'Notifikasi' })), yang sudah
// sengaja dihapus dari NAV_ITEMS (routes.ts, keputusan PM: Notifikasi di
// luar scope MVP).
//
// `vi.mock('../../../api/notifications', ...)` di atas TETAP dipertahankan
// (bukan lagi buat mencegah AppShell nembak fetch beneran -- AppShell
// SUDAH TIDAK memanggil useUnreadNotifications() sama sekali sekarang --
// tapi supaya mock module-nya tetap konsisten/aman kalau nanti ada test
// lain di file ini yang butuh). Test di bawah membuktikan runtime-nya
// beneran mati, bukan cuma diasumsikan dari "route sudah dihapus".
describe('Notification runtime TIDAK aktif di AppShell (di luar MVP scope)', () => {
  it('AppShell mount (rute mana pun, role mana pun) TIDAK memicu fetchNotifications() sama sekali', async () => {
    const router = renderAt(ROUTES.dashboard, 'owner')
    await settledAt(router, ROUTES.dashboard)

    expect(mockedFetchNotifications).not.toHaveBeenCalled()
  })
})
