import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { AppShell } from '../layout/AppShell'
import { SettingsLayout } from '../layout/SettingsLayout'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireRole } from '../auth/RequireRole'
import { DashboardPage } from '../../pages/DashboardPage'
import { KasirPage } from '../../pages/KasirPage'
import { LoginPage } from '../../pages/LoginPage'
import { NotFoundPage } from '../../pages/NotFoundPage'
import { NotificationsPage } from '../../pages/NotificationsPage'
import { OrdersPage } from '../../pages/OrdersPage'
import { PlatformsPage } from '../../pages/PlatformsPage'
import { ProductsPage } from '../../pages/ProductsPage'
import { ReportsPage } from '../../pages/ReportsPage'
import { StaffPage } from '../../pages/StaffPage'
import { StoreSettingsPage } from '../../pages/StoreSettingsPage'
import { TicketsPage } from '../../pages/TicketsPage'
import { OfflineSyncTestPage } from '../../pages/dev/OfflineSyncTestPage'
import { IndexRedirect } from './IndexRedirect'
import { NAV_ITEMS, ROUTES, type AppRole } from './routes'

/** Roles yang boleh buka path ini, diambil dari NAV_ITEMS (satu sumber kebenaran -- lihat routes.ts). */
function rolesFor(path: string): AppRole[] {
  const item = NAV_ITEMS.find((navItem) => navItem.path === path)
  if (!item) {
    throw new Error(`Rute ${path} belum didaftarkan di NAV_ITEMS (routes.ts) -- gak tau roles-nya siapa aja.`)
  }
  return item.roles
}

function guarded(path: string, element: ReactNode) {
  return <RequireRole roles={rolesFor(path)}>{element}</RequireRole>
}

// Konfigurasi rute dipisah dari createBrowserRouter supaya test bisa
// pakai createMemoryRouter(routeConfig, ...) dengan rute yang PERSIS
// sama kayak yang jalan di production -- bukan reimplementasi terpisah
// di file test yang bisa diam-diam menyimpang dari aslinya.
//
// Login sengaja di luar AppShell (halaman login tidak punya nav).
// Dua lapis RBAC (SRS 2.2): RequireAuth di '/' mastiin sudah login,
// RequireRole di tiap child route mastiin rolenya emang boleh ke situ.
export const routeConfig: RouteObject[] = [
  { path: ROUTES.login, element: <LoginPage /> },
  // Dev-only, gak ikut ke production build (lihat OfflineSyncTestPage.tsx
  // buat cara pakai) -- HAPUS setelah Kasir Page (Fase 5) jadi.
  ...(import.meta.env.DEV ? [{ path: '/dev/offline-sync-test', element: <OfflineSyncTestPage /> }] : []),
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <IndexRedirect /> },
      { path: 'dashboard', element: guarded(ROUTES.dashboard, <DashboardPage />) },
      { path: 'kasir', element: guarded(ROUTES.kasir, <KasirPage />) },
      { path: 'products', element: guarded(ROUTES.products, <ProductsPage />) },
      { path: 'tickets', element: guarded(ROUTES.tickets, <TicketsPage />) },
      { path: 'orders', element: guarded(ROUTES.orders, <OrdersPage />) },
      { path: 'platforms', element: guarded(ROUTES.platforms, <PlatformsPage />) },
      { path: 'reports', element: guarded(ROUTES.reports, <ReportsPage />) },
      {
        path: 'settings',
        element: guarded(ROUTES.settings, <SettingsLayout />),
        children: [
          { index: true, element: <Navigate to="store" replace /> },
          { path: 'store', element: <StoreSettingsPage /> },
          { path: 'staff', element: <StaffPage /> },
        ],
      },
      { path: 'notifications', element: guarded(ROUTES.notifications, <NotificationsPage />) },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]

export const router = createBrowserRouter(routeConfig)
