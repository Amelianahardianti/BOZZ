// backend/src/modules/dashboard/service.ts

import * as repo from './repository';

const LOW_STOCK_LIST_LIMIT = 5;
const RECENT_STOCK_ACTIVITY_LIMIT = 5;

/**
 * Batas "hari ini" dirakit PER KOMPONEN dari jam SERVER -- pola yang
 * sama persis dengan awalHari()/akhirHari() di
 * sales-inventory/routes.ts (dipakai buat filter tanggal GET
 * /transactions). `new Date("YYYY-MM-DD")` sengaja TIDAK dipakai karena
 * dibaca sebagai tengah malam UTC, yang salah di server WIB (UTC+7).
 * Server WAJIB berjalan di TZ=Asia/Jakarta (belum ada kolom timezone
 * toko di database/kontrak) -- lihat catatan yang sama di precedent-nya.
 */
function rentangHariIni(): { awalHari: Date; akhirHari: Date } {
  const sekarang = new Date();
  const tahun = sekarang.getFullYear();
  const bulan = sekarang.getMonth();
  const hari = sekarang.getDate();

  return {
    awalHari: new Date(tahun, bulan, hari, 0, 0, 0, 0),
    akhirHari: new Date(tahun, bulan, hari, 23, 59, 59, 999),
  };
}

export interface DashboardResponse {
  overview: {
    totalProducts: number;
    activeProducts: number;
    lowStockProducts: number;
    todayPosSales: number;
    todayPosTransactions: number;
    marketplaceOrders: number;
    marketplaceOrderValue: number;
  };
  tickets: repo.TicketSummary;
  lowStock: repo.LowStockProduct[];
  recentStockActivity: repo.RecentStockActivityItem[];
}

export async function getDashboard(): Promise<DashboardResponse> {
  const { awalHari, akhirHari } = rentangHariIni();

  const [productOverview, lowStock, todayPos, marketplace, tickets, recentStockActivity] = await Promise.all([
    repo.getProductOverview(),
    repo.getLowStockProducts(LOW_STOCK_LIST_LIMIT),
    repo.getTodayPosSales(awalHari, akhirHari),
    repo.getMarketplaceSummary(),
    repo.getTicketSummary(),
    repo.getRecentStockActivity(RECENT_STOCK_ACTIVITY_LIMIT),
  ]);

  return {
    overview: {
      totalProducts: productOverview.totalProducts,
      activeProducts: productOverview.activeProducts,
      lowStockProducts: lowStock.count,
      todayPosSales: todayPos.todayPosSales,
      todayPosTransactions: todayPos.todayPosTransactions,
      marketplaceOrders: marketplace.marketplaceOrders,
      marketplaceOrderValue: marketplace.marketplaceOrderValue,
    },
    tickets,
    lowStock: lowStock.items,
    recentStockActivity,
  };
}
