// backend/src/modules/dashboard/repository.ts

// Modul dashboard (Task 12A.2) sengaja TERPISAH dari sales-inventory
// walau sebagian tabelnya sama (products, transactions, stock_adjustments)
// -- dashboard membaca LINTAS domain (products, transactions,
// external_orders, tickets, stock_adjustments), jadi mencampurkannya ke
// repository sales-inventory akan mengaburkan batas modul yang sudah ada.
//
// Prinsip: HANYA baca (SELECT/count/aggregate/groupBy). Tidak ada
// write/update/delete di file ini sama sekali.

import { prisma } from '../../shared/db';

// ---------- Product overview ----------

export interface ProductOverview {
  totalProducts: number;
  activeProducts: number;
}

export async function getProductOverview(): Promise<ProductOverview> {
  const [totalProducts, activeProducts] = await Promise.all([
    prisma.products.count(),
    prisma.products.count({ where: { is_active: true } }),
  ]);
  return { totalProducts, activeProducts };
}

// ---------- Low stock ----------

export interface LowStockProduct {
  id: string;
  name: string;
  sku: string | null;
  stockQty: number;
  lowStockThreshold: number;
}

interface LowStockRow {
  id: string;
  name: string;
  sku: string | null;
  stock_qty: number;
  low_stock_threshold: number;
}

/**
 * `stock_qty <= low_stock_threshold` membandingkan DUA kolom di baris
 * yang sama -- Prisma `where` tidak bisa menyatakan ini tanpa raw SQL.
 * Query di bawah persis mengikuti definisi partial index yang sudah ada
 * (`idx_products_low_stock`, lihat prisma/schema.prisma), jadi indexnya
 * langsung kepakai, bukan cuma didekorasi tanpa dipakai.
 *
 * Dibatasi `is_active = true`: produk nonaktif tidak dijual (dikeluarkan
 * dari katalog Kasir/POS lewat productCache.ts sejak sesi sebelumnya),
 * jadi tidak relevan buat "perlu di-restock" -- keputusan ini
 * didokumentasikan di laporan akhir Task 12A.2, bukan business rule baru
 * yang diam-diam ditambahkan.
 */
export async function getLowStockProducts(
  limit: number
): Promise<{ count: number; items: LowStockProduct[] }> {
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<LowStockRow[]>`
      SELECT id, name, sku, stock_qty, low_stock_threshold
      FROM products
      WHERE is_active = true AND stock_qty <= low_stock_threshold
      ORDER BY stock_qty ASC, name ASC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM products
      WHERE is_active = true AND stock_qty <= low_stock_threshold
    `,
  ]);

  return {
    count: Number(countRows[0]?.count ?? 0),
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      stockQty: r.stock_qty,
      lowStockThreshold: r.low_stock_threshold,
    })),
  };
}

// ---------- Today's POS sales ----------

export interface TodayPosSales {
  todayPosSales: number;
  todayPosTransactions: number;
}

export async function getTodayPosSales(awalHari: Date, akhirHari: Date): Promise<TodayPosSales> {
  const result = await prisma.transactions.aggregate({
    where: { status: 'completed', created_at: { gte: awalHari, lte: akhirHari } },
    _sum: { total_amount: true },
    _count: { _all: true },
  });

  return {
    todayPosSales: Number(result._sum.total_amount ?? 0),
    todayPosTransactions: result._count._all,
  };
}

// ---------- Marketplace summary ----------

export interface MarketplaceSummary {
  marketplaceOrders: number;
  marketplaceOrderValue: number;
}

/**
 * `marketplaceOrders` menghitung SELURUH external_orders (termasuk
 * cancelled) -- ini angka "berapa order yang pernah masuk", bukan angka
 * revenue, jadi dibiarkan mentah.
 *
 * `marketplaceOrderValue` MENGECUALIKAN status 'cancelled': ditelusuri
 * dari ALLOWED_STATUS_TRANSITIONS di ecommerce-sync/service.ts,
 * 'cancelled' adalah status terminal yang bisa dicapai dari status aktif
 * mana pun (new/processing/shipped) -- persis analog 'voided' di
 * transactions POS, yang juga dikeluarkan dari today's sales. Order yang
 * batal tidak pernah benar-benar menghasilkan uang, jadi tidak boleh
 * ikut dihitung sebagai nilai order. Keputusan ini didokumentasikan di
 * laporan akhir Task 12A.2 sesuai permintaan brief.
 */
export async function getMarketplaceSummary(): Promise<MarketplaceSummary> {
  const [marketplaceOrders, valueResult] = await Promise.all([
    prisma.external_orders.count(),
    prisma.external_orders.aggregate({
      where: { status: { not: 'cancelled' } },
      _sum: { total_amount: true },
    }),
  ]);

  return {
    marketplaceOrders,
    marketplaceOrderValue: Number(valueResult._sum.total_amount ?? 0),
  };
}

// ---------- Ticket summary ----------

export interface TicketSummary {
  unassigned: number;
  assigned: number;
  packing: number;
  packed: number;
  handedOver: number;
}

export async function getTicketSummary(): Promise<TicketSummary> {
  const grouped = await prisma.tickets.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  const counts = new Map(grouped.map((g) => [g.status, g._count._all]));

  return {
    unassigned: counts.get('unassigned') ?? 0,
    assigned: counts.get('assigned') ?? 0,
    packing: counts.get('packing') ?? 0,
    packed: counts.get('packed') ?? 0,
    handedOver: counts.get('handed_over') ?? 0,
  };
}

// ---------- Recent stock activity ----------

export interface RecentStockActivityItem {
  id: string;
  productId: string;
  productName: string;
  changeQty: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  referenceType: string | null;
  createdAt: string;
}

export async function getRecentStockActivity(limit: number): Promise<RecentStockActivityItem[]> {
  const rows = await prisma.stock_adjustments.findMany({
    orderBy: { created_at: 'desc' },
    take: limit,
    select: {
      id: true,
      product_id: true,
      change_qty: true,
      stock_before: true,
      stock_after: true,
      reason: true,
      reference_type: true,
      created_at: true,
      products: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.products.name,
    changeQty: r.change_qty,
    stockBefore: r.stock_before,
    stockAfter: r.stock_after,
    reason: r.reason,
    referenceType: r.reference_type,
    createdAt: r.created_at.toISOString(),
  }));
}
