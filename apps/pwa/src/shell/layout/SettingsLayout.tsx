import { NavLink, Outlet } from 'react-router-dom'

const tabClasses = (isActive: boolean) =>
  `border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
  }`

/**
 * Satu menu "Pengaturan" di nav, dua sub-tab di dalamnya (Toko & Staf).
 * Routing tetap terpisah (/settings/store, /settings/staff) -- cuma
 * dikelompokkan tampilannya biar gak jadi dua item nav beda di sidebar.
 */
export function SettingsLayout() {
  return (
    <>
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        <NavLink to="store" className={({ isActive }) => tabClasses(isActive)}>
          Toko
        </NavLink>
        <NavLink to="staff" className={({ isActive }) => tabClasses(isActive)}>
          Staf
        </NavLink>
      </div>
      <Outlet />
    </>
  )
}
