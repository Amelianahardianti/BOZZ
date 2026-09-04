// Satu sumber kebenaran buat path & daftar navigasi -- dipakai router
// (routes.tsx) dan shell layout (AppShell.tsx), biar path halaman
// gak keketik ulang di beberapa tempat dan gampang salah ketik.

export const ROUTES = {
  login: '/login',
  dashboard: '/dashboard',
  kasir: '/kasir',
  products: '/products',
  tickets: '/tickets',
  orders: '/orders',
  platforms: '/platforms',
  reports: '/reports',
  settings: '/settings',
  staff: '/settings/staff',
  storeSettings: '/settings/store',
  notifications: '/notifications',
} as const

/** Role sesuai SRS 2.2 -- harus sama persis sama Role di backend shared/middleware/auth.ts. */
export type AppRole = 'owner' | 'kasir' | 'pengepak'

export interface NavItem {
  path: string
  label: string
  /** Role yang boleh lihat menu ini (SRS 2.2, tabel hak akses). */
  roles: AppRole[]
}

// NOTE: belum difilter per role -- semua item tampil buat siapa aja
// dulu. Filter beneran (cuma tampilin item yang roles-nya cocok sama
// user yang login) baru dipasang pas fase "RBAC-Aware Route Guards".
export const NAV_ITEMS: NavItem[] = [
  { path: ROUTES.kasir, label: 'Kasir', roles: ['owner', 'kasir'] },
  { path: ROUTES.dashboard, label: 'Dashboard', roles: ['owner'] },
  { path: ROUTES.orders, label: 'Pesanan Masuk', roles: ['owner'] },
  { path: ROUTES.tickets, label: 'Ticket Saya', roles: ['owner', 'pengepak'] },
  { path: ROUTES.products, label: 'Produk', roles: ['owner'] },
  { path: ROUTES.platforms, label: 'Platform', roles: ['owner'] },
  { path: ROUTES.reports, label: 'Laporan', roles: ['owner'] },
  { path: ROUTES.settings, label: 'Pengaturan', roles: ['owner'] },
  { path: ROUTES.notifications, label: 'Notifikasi', roles: ['owner', 'kasir', 'pengepak'] },
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
