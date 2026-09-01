import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { AppShell } from '../layout/AppShell'
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
import { ROUTES } from './routes'

// Konfigurasi rute dipisah dari createBrowserRouter supaya test bisa
// pakai createMemoryRouter(routeConfig, ...) dengan rute yang PERSIS
// sama kayak yang jalan di production -- bukan reimplementasi terpisah
// di file test yang bisa diam-diam menyimpang dari aslinya.
//
// Login sengaja di luar AppShell (halaman login tidak punya nav).
// RBAC-Aware Route Guards (fase berikutnya) akan menambahkan pengecekan
// token + role di sini -- login required buat masuk ke '/', dan tiap
// child route dibatasi sesuai roles di routes.ts.
export const routeConfig: RouteObject[] = [
  { path: ROUTES.login, element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={ROUTES.dashboard} replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'kasir', element: <KasirPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'tickets', element: <TicketsPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'platforms', element: <PlatformsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'staff', element: <StaffPage /> },
      { path: 'settings', element: <StoreSettingsPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]

export const router = createBrowserRouter(routeConfig)
