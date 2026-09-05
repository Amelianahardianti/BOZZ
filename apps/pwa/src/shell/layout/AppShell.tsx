import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FiBell, FiChevronDown, FiChevronsLeft, FiChevronsRight, FiLogOut, FiSettings } from 'react-icons/fi'
import { useAuth } from '../auth/useAuth'
import { useUnreadNotifications } from '../notifications/useUnreadNotifications'
import { getCachedStoreSettings, syncStoreSettingsCache } from '../offline/storeSettingsCache'
import { NAV_ITEMS, ROUTES, type AppRole, type NavCategory, type NavItem } from '../routing/routes'

const CATEGORY_LABEL: Record<NavCategory, string> = {
  operasional: 'Operasional',
  bisnis: 'Bisnis',
  lainnya: 'Lainnya',
}

// Owner kerjaannya lebih ke sisi bisnis (dashboard, produk, dst), jadi
// kategori itu ditaruh paling atas buat dia. Kasir/Pengepak gak punya
// menu Bisnis sama sekali (difilter abis lewat `roles` di NAV_ITEMS,
// renderNavGroup udah otomatis skip kategori kosong) -- urutannya di
// sini cuma soal kategori yang MEMANG kepakai buat role itu.
const CATEGORY_ORDER_BY_ROLE: Record<AppRole, NavCategory[]> = {
  owner: ['bisnis', 'operasional', 'lainnya'],
  kasir: ['operasional', 'lainnya', 'bisnis'],
  pengepak: ['operasional', 'lainnya', 'bisnis'],
}

const SIDEBAR_COLLAPSED_KEY = 'pos-pwa:sidebar-collapsed'

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    // localStorage gak bisa diakses (mis. private mode) -- default expanded.
    return false
  }
}

function storeCollapsed(value: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? '1' : '0')
  } catch {
    // Diemin -- cuma preferensi tampilan, gak fatal kalau gagal disimpan.
  }
}

const linkClasses = (isActive: boolean, isCollapsed: boolean) =>
  `flex items-center gap-2.5 rounded-lg border-l-2 py-2 text-sm font-medium transition-colors ${
    isCollapsed ? 'justify-center px-2' : 'pl-2.5 pr-3'
  } ${isActive ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-transparent text-slate-600 hover:bg-slate-100'}`

const tabClasses = (isActive: boolean) =>
  `flex min-w-18 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center text-xs leading-tight font-medium transition-colors ${
    isActive ? 'text-brand-700' : 'text-slate-500'
  }`

/**
 * Shell bersama semua halaman berlogin -- sidebar (bisa di-collapse) +
 * top header fixed di desktop, bottom tab-bar di mobile (NFR-05: aksi
 * penting maks 1-2 tap). Dibungkus RequireAuth (router.tsx), jadi
 * `session` di sini seharusnya SELALU ada -- tetap dijaga null-safe
 * buat momen sesaat pas logout.
 */
export function AppShell() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { count: unreadCount } = useUnreadNotifications()
  const storeSettings = useLiveQuery(() => getCachedStoreSettings(), []) ?? null

  const [isCollapsed, setIsCollapsed] = useState(readStoredCollapsed)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  // Nav cuma nampilin halaman yang emang haknya role ini (SRS 2.2) --
  // Kasir gak lihat menu Dashboard/Produk/dst, cuma Kasir & Notifikasi.
  const visibleNavItems = session ? NAV_ITEMS.filter((item) => item.roles.includes(session.user.role)) : []
  const activeNavItem = visibleNavItems.find((item) => location.pathname.startsWith(item.path))
  const categoryOrder = session ? CATEGORY_ORDER_BY_ROLE[session.user.role] : CATEGORY_ORDER_BY_ROLE.owner

  // Sidebar tampil di SEMUA halaman (bukan cuma Kasir), jadi cache
  // profil toko harus disegarkan dari sini juga -- kalau cuma
  // ngandelin KasirPage (yang juga manggil ini), role yang gak pernah
  // buka Kasir (mis. pengepak) gak akan pernah lihat nama tokonya.
  // Idempotent, aman dipanggil dobel kalau kebetulan juga buka Kasir.
  useEffect(() => {
    syncStoreSettingsCache().catch(() => {
      // Gagal diam-diam (offline/gagal fetch) -- sidebar fallback ke
      // label netral, bukan bikin shell crash.
    })
  }, [])

  function toggleCollapsed() {
    setIsCollapsed((prev) => {
      const next = !prev
      storeCollapsed(next)
      return next
    })
  }

  function handleLogout() {
    setIsAccountMenuOpen(false)
    logout()
    navigate(ROUTES.login, { replace: true })
  }

  // Tutup account dropdown pas klik di luar atau tekan Escape -- pola
  // umum React (listener manual), gak perlu library baru buat satu
  // dropdown ini.
  useEffect(() => {
    if (!isAccountMenuOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsAccountMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAccountMenuOpen])

  function renderNavGroup(category: NavCategory, items: NavItem[]) {
    const groupItems = items.filter((item) => item.category === category)
    if (groupItems.length === 0) return null

    return (
      <div key={category} className="flex flex-col gap-1">
        {!isCollapsed && (
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{CATEGORY_LABEL[category]}</p>
        )}
        {groupItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              title={isCollapsed ? item.label : undefined}
              aria-label={isCollapsed ? item.label : undefined}
              className={({ isActive }) => linkClasses(isActive, isCollapsed)}
            >
              <Icon aria-hidden="true" className="h-4.5 w-4.5 shrink-0" />
              {!isCollapsed && (
                <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate">{item.label}</span>
                  {item.path === ROUTES.notifications && unreadCount > 0 && (
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                      {unreadCount}
                    </span>
                  )}
                </span>
              )}
            </NavLink>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-slate-50 md:h-screen md:flex-row md:overflow-hidden">
      <aside
        className={`hidden shrink-0 flex-col border-r border-slate-200 bg-white p-3 transition-[width] md:flex print:hidden ${
          isCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div
          className={`mb-4 flex items-center gap-2 px-1 ${isCollapsed ? 'flex-col justify-center gap-2' : ''}`}
        >
          {/* Placeholder logo BOZZ -- ganti <img src="/logo-bozz.svg" /> pas aset final tersedia. */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-brand-300 bg-brand-50 text-sm font-bold text-brand-700">
            B
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{storeSettings?.business_name || 'Toko'}</p>
              <p className="truncate text-xs text-slate-400">POS Multi-Platform</p>
            </div>
          )}
          {/* Quick-access collapse/expand -- sejajar sama nama toko. Tombol
              di bawah sidebar TETAP dipertahankan (quick-access kedua),
              dua-duanya ngontrol state isCollapsed yang SAMA. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            aria-label={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {isCollapsed ? <FiChevronsRight aria-hidden="true" /> : <FiChevronsLeft aria-hidden="true" />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {categoryOrder.map((category) => renderNavGroup(category, visibleNavItems))}
        </nav>

        <button
          type="button"
          onClick={toggleCollapsed}
          title={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          aria-label={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          className={`mt-3 flex items-center gap-2 rounded-lg border-t border-slate-200 pt-3 text-sm font-medium text-slate-500 hover:text-slate-700 ${
            isCollapsed ? 'justify-center' : 'px-2'
          }`}
        >
          {isCollapsed ? <FiChevronsRight aria-hidden="true" /> : <FiChevronsLeft aria-hidden="true" />}
          {!isCollapsed && 'Ciutkan'}
        </button>
      </aside>

      <div className="flex flex-1 flex-col md:overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden print:hidden">
          <p className="text-sm font-semibold text-slate-900">BOZZ</p>
          {session && (
            <button type="button" onClick={handleLogout} className="text-sm font-medium text-slate-500">
              Keluar
            </button>
          )}
        </header>

        {/* Top header desktop -- fixed relatif ke kolom konten (gak ikut scroll `<main>`), cuma tampil md: ke atas. Header mobile di atas TETAP struktur lama.
            bg SAMA kayak background content (bg-slate-50, bukan bg-white), TANPA
            border-b -- biar nyatu sama content, bukan keliatan kayak panel
            terpisah. Padding horizontal-nya TIDAK di header langsung --
            dibungkus mx-auto max-w-7xl yang PERSIS sama kayak wrapper di
            <main>, biar batas kiri judul sejajar sama batas kiri PageHeader di
            bawahnya, di lebar viewport & state collapsed apapun. */}
        <header className="hidden shrink-0 bg-slate-50 md:flex print:hidden">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-6">
            {/* Bukan <h1> -- ini cuma label chrome (nama menu aktif), bukan
                document heading. Heading beneran tetap punya page-nya
                sendiri (<PageHeader> di dalam content, BELUM dihapus di task
                ini) -- ukuran/weight di sini SENGAJA disamakan ke besar &
                prominent (matching PageHeader: text-xl/2xl font-bold),
                nyiapin biar nanti ini bisa jadi SATU-SATUNYA page heading
                begitu <PageHeader> per-halaman dihapus di task selanjutnya. */}
            <p className="text-xl font-bold text-slate-900 md:text-2xl">{activeNavItem?.label ?? ''}</p>

            {session && (
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.notifications)}
                  title="Notifikasi"
                  aria-label={`Notifikasi${unreadCount > 0 ? `, ${unreadCount} belum dibaca` : ''}`}
                  className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <FiBell aria-hidden="true" className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-100 px-1 text-[10px] font-semibold text-red-700">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <div ref={accountMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                    aria-haspopup="true"
                    aria-expanded={isAccountMenuOpen}
                    className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 hover:bg-slate-100"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                      {session.user.name.trim().charAt(0).toUpperCase() || '?'}
                    </span>
                    <span className="text-left leading-tight">
                      <span className="block text-sm font-medium text-slate-900">{session.user.name}</span>
                      <span className="block text-xs capitalize text-slate-400">{session.user.role}</span>
                    </span>
                    <FiChevronDown aria-hidden="true" className="text-slate-400" />
                  </button>

                  {isAccountMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                    >
                      {session.user.role === 'owner' && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsAccountMenuOpen(false)
                            navigate(ROUTES.staff)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <FiSettings aria-hidden="true" />
                          Pengaturan Akun
                        </button>
                      )}
                      {session.user.role === 'owner' && <div className="my-1 border-t border-slate-100" />}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        <FiLogOut aria-hidden="true" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Padding HORIZONTAL sengaja di dalam wrapper mx-auto max-w-7xl
            (bukan di <main> langsung) -- header di atas pakai struktur
            yang PERSIS sama (mx-auto max-w-7xl px-4 md:px-6). Kalau
            padding-nya taruh di luar (di <main>) kayak sebelumnya, box
            max-w-7xl yang di-center itu jadi punya lebar berbeda antara
            header & main (satu keinset duluan sama padding luar, satu
            enggak), jadi biar SAMA persis kiri-kanannya, sumber padding-
            nya harus di lapisan yang sama juga. */}
        <main className="flex-1 py-4 md:overflow-y-auto md:py-6 print:py-0">
          <div className="mx-auto w-full max-w-7xl px-4 md:px-6 print:px-0">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 flex gap-x-0.5 overflow-x-auto border-t border-slate-200 bg-white px-1 md:hidden print:hidden">
        {visibleNavItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => tabClasses(isActive)}>
              <Icon aria-hidden="true" className="h-4.5 w-4.5" />
              <span className="relative">
                {item.label}
                {item.path === ROUTES.notifications && unreadCount > 0 && (
                  <span className="absolute -right-2.5 -top-1 rounded-full bg-red-100 px-1 text-[10px] font-semibold text-red-700">
                    {unreadCount}
                  </span>
                )}
              </span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
