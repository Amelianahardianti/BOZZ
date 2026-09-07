// backend/src/modules/reports/repository.ts

// Modul reports (Task 13A) TERPISAH dari sales-inventory/ecommerce-sync
// walau membaca tabel yang sama -- reports membaca LINTAS domain (POS +
// marketplace), sama seperti alasan dashboard/repository.ts terpisah
// (Task 12A.2). HANYA baca (SELECT/aggregate). Tidak ada write di sini.

import { prisma } from '../../shared/db';

export interface PosSaleRow {
  id: string;
  totalAmount: number;
  date: Date;
  status: string;
  customerName: string | null;
  items: { productId: string; productName: string; sku: string | null; qty: number; subtotal: number }[];
}

/** POS: hanya transaksi 'completed' -- 'voided' TIDAK PERNAH masuk laporan penjualan (lihat service.ts). */
export async function getPosSales(dateFromStart: Date, dateToEnd: Date): Promise<PosSaleRow[]> {
  const rows = await prisma.transactions.findMany({
    where: { status: 'completed', created_at: { gte: dateFromStart, lte: dateToEnd } },
    select: {
      id: true,
      total_amount: true,
      created_at: true,
      status: true,
      customers: { select: { name: true } },
      transaction_items: {
        select: {
          product_id: true,
          product_name_snapshot: true,
          qty: true,
          subtotal: true,
          products: { select: { sku: true } },
        },
      },
    },
    orderBy: { created_at: 'asc' },
  });

  return rows.map((r) => ({
    id: r.id,
    totalAmount: Number(r.total_amount),
    date: r.created_at,
    status: r.status,
    customerName: r.customers?.name ?? null,
    items: r.transaction_items.map((i) => ({
      productId: i.product_id,
      productName: i.product_name_snapshot,
      sku: i.products.sku,
      qty: i.qty,
      subtotal: Number(i.subtotal),
    })),
  }));
}

export interface MarketplaceSaleRow {
  id: string;
  externalOrderId: string;
  totalAmount: number;
  date: Date;
  status: string;
  customerName: string | null;
  items: { productId: string | null; productName: string; sku: string | null; qty: number; lineAmount: number }[];
}

/**
 * Marketplace: SEMUA status KECUALI 'cancelled' -- konsisten dengan
 * keputusan marketplaceOrderValue di dashboard/repository.ts (Task
 * 12A.2): order marketplace merepresentasikan komitmen/pembayaran nyata
 * sejak dibuat, analog transaksi POS 'completed', beda sama
 * 'cancelled'/'voided' yang membatalkan transaksinya. Didokumentasikan
 * di laporan akhir Task 13A karena brief eksplisit minta keputusan ini
 * dicatat (ambiguity shipped vs completed).
 */
export async function getMarketplaceSales(dateFromStart: Date, dateToEnd: Date): Promise<MarketplaceSaleRow[]> {
  const rows = await prisma.external_orders.findMany({
    where: { status: { not: 'cancelled' }, received_at: { gte: dateFromStart, lte: dateToEnd } },
    select: {
      id: true,
      external_order_id: true,
      total_amount: true,
      received_at: true,
      status: true,
      customers: { select: { name: true, external_username: true } },
      external_order_items: {
        select: {
          product_id: true,
          item_name_snapshot: true,
          qty: true,
          unit_price: true,
          products: { select: { name: true, sku: true } },
        },
      },
    },
    orderBy: { received_at: 'asc' },
  });

  return rows.map((r) => ({
    id: r.id,
    externalOrderId: r.external_order_id,
    totalAmount: Number(r.total_amount ?? 0),
    date: r.received_at,
    status: r.status,
    customerName: r.customers?.name ?? r.customers?.external_username ?? null,
    items: r.external_order_items.map((i) => ({
      productId: i.product_id,
      // Item TANPA product mapping (product_id null) tetap dikembalikan
      // (masuk marketplaceSalesAmount), tapi productName-nya pakai
      // snapshot mentah dari platform, BUKAN nama produk BOZZ -- lihat
      // service.ts (buildTopProducts) yang sengaja MENGECUALIKAN baris
      // ber-product_id null dari ranking Top Products.
      productName: i.products?.name ?? i.item_name_snapshot,
      sku: i.products?.sku ?? null,
      qty: i.qty,
      lineAmount: Number(i.unit_price ?? 0) * i.qty,
    })),
  }));
}
