import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { NAV_ITEMS, ROUTES } from '../routing/routes'

const linkClasses = (isActive: boolean) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
  }`

const tabClasses = (isActive: boolean) =>
  `flex min-w-18 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center text-xs leading-tight font-medium transition-colors ${
    isActive ? 'text-brand-700' : 'text-slate-500'
  }`

/**
 * Shell bersama semua halaman berlogin -- sidebar di desktop, bottom
 * tab-bar di mobile (NFR-05: aksi penting maks 1-2 tap). Dibungkus
 * RequireAuth (router.tsx), jadi `session` di sini seharusnya SELALU
 * ada -- tetap dijaga null-safe buat momen sesaat pas logout.
 */
export function AppShell() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  // Nav cuma nampilin halaman yang emang haknya role ini (SRS 2.2) --
  // Kasir gak lihat menu Dashboard/Produk/dst, cuma Kasir & Notifikasi.
  const visibleNavItems = session ? NAV_ITEMS.filter((item) => item.roles.includes(session.user.role)) : []

  function handleLogout() {
    logout()
    navigate(ROUTES.login, { replace: true })
  }

  return (
    <div className="flex min-h-svh flex-col bg-slate-50 md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <p className="mb-4 px-2 text-sm font-semibold text-slate-900">POS PWA</p>
        <nav className="flex flex-1 flex-col gap-1">
          {visibleNavItems.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => linkClasses(isActive)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {session && (
          <div className="border-t border-slate-200 pt-3">
            <p className="truncate px-2 text-sm font-medium text-slate-700">{session.user.name}</p>
            <p className="px-2 text-xs text-slate-400 capitalize">{session.user.role}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 w-full rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Keluar
            </button>
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col pb-16 md:pb-0">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <p className="text-sm font-semibold text-slate-900">POS PWA</p>
          {session && (
            <button type="button" onClick={handleLogout} className="text-sm font-medium text-slate-500">
              Keluar
            </button>
          )}
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 flex gap-x-0.5 overflow-x-auto border-t border-slate-200 bg-white px-1 md:hidden">
        {visibleNavItems.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => tabClasses(isActive)}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
