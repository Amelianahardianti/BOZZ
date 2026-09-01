import { NavLink, Outlet } from 'react-router-dom'
import { NAV_ITEMS } from '../routing/routes'

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
 * tab-bar di mobile (NFR-05: aksi penting maks 1-2 tap). NAV_ITEMS
 * belum difilter per role di sini (lihat routes.ts) -- itu tugas fase
 * "RBAC-Aware Route Guards" berikutnya, jadi tampilannya masih penuh.
 */
export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col bg-slate-50 md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
        <p className="mb-4 px-2 text-sm font-semibold text-slate-900">POS PWA</p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => linkClasses(isActive)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col pb-16 md:pb-0">
        <header className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <p className="text-sm font-semibold text-slate-900">POS PWA</p>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 flex gap-x-0.5 overflow-x-auto border-t border-slate-200 bg-white px-1 md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => tabClasses(isActive)}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
