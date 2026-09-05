// Satu sumber kebenaran buat path & daftar navigasi -- dipakai router
// (routes.tsx) dan shell layout (AppShell.tsx), biar path halaman
// gak keketik ulang di beberapa tempat dan gampang salah ketik.

import {
  FiBarChart2,
  FiBell,
  FiBox,
  FiClipboard,
  FiClock,
  FiHome,
  FiInbox,
  FiLink,
  FiSettings,
  FiShoppingCart,
} from 'react-icons/fi'
import type { IconType } from 'react-icons'

export const ROUTES = {
  login: '/login',
  dashboard: '/dashboard',
  kasir: '/kasir',
  products: '/products',
  tickets: '/tickets',
  orders: '/orders',
  platforms: '/platforms',
  reports: '/reports',
  transactionHistory: '/riwayat-transaksi',
  settings: '/settings',
  staff: '/settings/staff',
  storeSettings: '/settings/store',
  notifications: '/notifications',
} as const

/** Role sesuai SRS 2.2 -- harus sama persis sama Role di backend shared/middleware/auth.ts. */
export type AppRole = 'owner' | 'kasir' | 'pengepak'

/** Pengelompokan menu di sidebar (murni tampilan, gak ada hubungan sama role/hak akses). */
export type NavCategory = 'operasional' | 'bisnis' | 'lainnya'

export interface NavItem {
  path: string
  label: string
  /** Role yang boleh lihat menu ini (SRS 2.2, tabel hak akses). */
  roles: AppRole[]
  icon: IconType
  category: NavCategory
}

// NOTE: belum difilter per role -- semua item tampil buat siapa aja
// dulu. Filter beneran (cuma tampilin item yang roles-nya cocok sama
// user yang login) baru dipasang pas fase "RBAC-Aware Route Guards".
export const NAV_ITEMS: NavItem[] = [
  { path: ROUTES.kasir, label: 'Kasir', roles: ['owner', 'kasir'], icon: FiShoppingCart, category: 'operasional' },
  { path: ROUTES.orders, label: 'Pesanan Masuk', roles: ['owner'], icon: FiInbox, category: 'operasional' },
  { path: ROUTES.tickets, label: 'Ticket Saya', roles: ['owner', 'pengepak'], icon: FiClipboard, category: 'operasional' },
  {
    path: ROUTES.transactionHistory,
    label: 'Riwayat Transaksi',
    roles: ['owner', 'kasir'],
    icon: FiClock,
    category: 'operasional',
  },
  { path: ROUTES.dashboard, label: 'Dashboard', roles: ['owner'], icon: FiHome, category: 'bisnis' },
  { path: ROUTES.products, label: 'Produk', roles: ['owner'], icon: FiBox, category: 'bisnis' },
  { path: ROUTES.platforms, label: 'Platform', roles: ['owner'], icon: FiLink, category: 'bisnis' },
  { path: ROUTES.reports, label: 'Laporan', roles: ['owner'], icon: FiBarChart2, category: 'bisnis' },
  {
    path: ROUTES.notifications,
    label: 'Notifikasi',
    roles: ['owner', 'kasir', 'pengepak'],
    icon: FiBell,
    category: 'lainnya',
  },
  { path: ROUTES.settings, label: 'Pengaturan', roles: ['owner'], icon: FiSettings, category: 'lainnya' },
]

/**
 * Halaman pertama yang dilihat tiap role abis login -- sesuai SRS 2.2
 * (tabel hak akses): Kasir cuma punya akses Kasir/POS, Pengepak cuma
 * 'Ticket Saya', jadi jangan diarahin ke Dashboard yang bukan haknya.
 */
export function getDefaultRouteForRole(role: AppRole): string {
  switch (role) {
    case 'kasir':
      return ROUTES.kasir
    case 'pengepak':
      return ROUTES.tickets
    case 'owner':
    default:
      return ROUTES.dashboard
  }
}
