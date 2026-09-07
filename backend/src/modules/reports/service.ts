// backend/src/modules/reports/service.ts

import ExcelJS from 'exceljs';
import * as repo from './repository';

const DEFAULT_RANGE_DAYS = 30;
const TOP_PRODUCTS_LIMIT = 5;

/**
 * Batas hari dirakit PER KOMPONEN dari jam SERVER -- pola yang sama
 * persis dengan awalHari()/akhirHari() di sales-inventory/routes.ts
 * (dipakai GET /transactions) dan rentangHariIni() di
 * dashboard/service.ts (Task 12A.2). Duplikasi kecil ini SENGAJA (bukan
 * di-share lintas modul) mengikuti keputusan yang sama persis di Task
 * 12A.2 -- fungsi murni 2-3 baris, tidak sepadan bikin coupling antar
 * modul. `new Date("YYYY-MM-DD")` sengaja TIDAK dipakai (dibaca sebagai
 * tengah malam UTC, salah di server WIB/UTC+7).
 */
function awalHari(isoDate: string): Date {
  const [tahun, bulan, hari] = isoDate.split('-').map(Number);
  return new Date(tahun, bulan - 1, hari, 0, 0, 0, 0);
}

function akhirHari(isoDate: string): Date {
  const [tahun, bulan, hari] = isoDate.split('-').map(Number);
  return new Date(tahun, bulan - 1, hari, 23, 59, 59, 999);
}

function isoDateOf(date: Date): string {
  const tahun = date.getFullYear();
  const bulan = String(date.getMonth() + 1).padStart(2, '0');
  const hari = String(date.getDate()).padStart(2, '0');
  return `${tahun}-${bulan}-${hari}`;
}

function tambahHari(isoDate: string, jumlah: number): string {
  const [tahun, bulan, hari] = isoDate.split('-').map(Number);
  return isoDateOf(new Date(tahun, bulan - 1, hari + jumlah));
}

/** Semua tanggal (inklusif) antara dua ISO date -- dipakai buat zero-fill hari tanpa penjualan (brief section 12). */
function semuaTanggalDi(dateFrom: string, dateTo: string): string[] {
  const hasil: string[] = [];
  for (let cur = dateFrom; cur <= dateTo; cur = tambahHari(cur, 1)) {
    hasil.push(cur);
  }
  return hasil;
}

export interface SalesReportParams {
  dateFrom?: string;
  dateTo?: string;
}

export interface SalesReportResponse {
  period: { dateFrom: string; dateTo: string };
  summary: {
    totalSalesAmount: number;
    posSalesAmount: number;
    marketplaceSalesAmount: number;
    totalTransactions: number;
    posTransactions: number;
    marketplaceOrders: number;
  };
  trend: { date: string; posSales: number; marketplaceSales: number; totalSales: number }[];
  topProducts: { productId: string; productName: string; sku: string | null; quantitySold: number; totalSalesAmount: number }[];
  sales: {
    id: string;
    source: 'pos' | 'marketplace';
    reference: string;
    date: string;
    customer: string | null;
    totalAmount: number;
    status: string;
  }[];
}

function resolveRange(params: SalesReportParams): { dateFrom: string; dateTo: string } {
  const dateTo = params.dateTo ?? isoDateOf(new Date());
  const dateFrom = params.dateFrom ?? tambahHari(dateTo, -(DEFAULT_RANGE_DAYS - 1));
  return { dateFrom, dateTo };
}

async function buildReportData(params: SalesReportParams) {
  const { dateFrom, dateTo } = resolveRange(params);
  const dateFromStart = awalHari(dateFrom);
  const dateToEnd = akhirHari(dateTo);

  const [posSales, marketplaceSales] = await Promise.all([
    repo.getPosSales(dateFromStart, dateToEnd),
    repo.getMarketplaceSales(dateFromStart, dateToEnd),
  ]);

  return { dateFrom, dateTo, posSales, marketplaceSales };
}

function buildTrend(
  dateFrom: string,
  dateTo: string,
  posSales: repo.PosSaleRow[],
  marketplaceSales: repo.MarketplaceSaleRow[]
): SalesReportResponse['trend'] {
  const perHari = new Map<string, { posSales: number; marketplaceSales: number }>();
  for (const tanggal of semuaTanggalDi(dateFrom, dateTo)) {
    perHari.set(tanggal, { posSales: 0, marketplaceSales: 0 });
  }

  for (const t of posSales) {
    const key = isoDateOf(t.date);
    const bucket = perHari.get(key);
    if (bucket) bucket.posSales += t.totalAmount;
  }
  for (const o of marketplaceSales) {
    const key = isoDateOf(o.date);
    const bucket = perHari.get(key);
    if (bucket) bucket.marketplaceSales += o.totalAmount;
  }

  return [...perHari.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, posSales: v.posSales, marketplaceSales: v.marketplaceSales, totalSales: v.posSales + v.marketplaceSales }));
}

/**
 * Top Products: gabung item POS (semua, product_id selalu ada) + item
 * marketplace YANG PUNYA product_id (brief section 13/14) -- item
 * marketplace tanpa mapping (product_id null) TETAP masuk
 * marketplaceSalesAmount di summary, tapi TIDAK PERNAH masuk ranking
 * ini karena tidak ada atribusi produk BOZZ yang valid (mis. judul
 * mentah FakeStore tidak boleh keliru dianggap produk BOZZ).
 */
function buildTopProducts(posSales: repo.PosSaleRow[], marketplaceSales: repo.MarketplaceSaleRow[]): SalesReportResponse['topProducts'] {
  const perProduk = new Map<string, { productName: string; sku: string | null; quantitySold: number; totalSalesAmount: number }>();

  function tambah(productId: string, productName: string, sku: string | null, qty: number, amount: number) {
    const existing = perProduk.get(productId);
    if (existing) {
      existing.quantitySold += qty;
      existing.totalSalesAmount += amount;
    } else {
      perProduk.set(productId, { productName, sku, quantitySold: qty, totalSalesAmount: amount });
    }
  }

  for (const t of posSales) {
    for (const item of t.items) {
      tambah(item.productId, item.productName, item.sku, item.qty, item.subtotal);
    }
  }
  for (const o of marketplaceSales) {
    for (const item of o.items) {
      if (!item.productId) continue; // unmapped -- dikecualikan, lihat komentar di atas
      tambah(item.productId, item.productName, item.sku, item.qty, item.lineAmount);
    }
  }

  return [...perProduk.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.quantitySold - a.quantitySold || b.totalSalesAmount - a.totalSalesAmount)
    .slice(0, TOP_PRODUCTS_LIMIT);
}

function buildSalesTable(posSales: repo.PosSaleRow[], marketplaceSales: repo.MarketplaceSaleRow[]): SalesReportResponse['sales'] {
  const posRows = posSales.map((t) => ({
    id: t.id,
    source: 'pos' as const,
    reference: t.id,
    date: t.date.toISOString(),
    customer: t.customerName,
    totalAmount: t.totalAmount,
    status: t.status,
  }));
  const marketplaceRows = marketplaceSales.map((o) => ({
    id: o.id,
    source: 'marketplace' as const,
    reference: o.externalOrderId,
    date: o.date.toISOString(),
    customer: o.customerName,
    totalAmount: o.totalAmount,
    status: o.status,
  }));

  return [...posRows, ...marketplaceRows].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getSalesReport(params: SalesReportParams): Promise<SalesReportResponse> {
  const { dateFrom, dateTo, posSales, marketplaceSales } = await buildReportData(params);

  const posSalesAmount = posSales.reduce((sum, t) => sum + t.totalAmount, 0);
  const marketplaceSalesAmount = marketplaceSales.reduce((sum, o) => sum + o.totalAmount, 0);

  return {
    period: { dateFrom, dateTo },
    summary: {
      totalSalesAmount: posSalesAmount + marketplaceSalesAmount,
      posSalesAmount,
      marketplaceSalesAmount,
      totalTransactions: posSales.length + marketplaceSales.length,
      posTransactions: posSales.length,
      marketplaceOrders: marketplaceSales.length,
    },
    trend: buildTrend(dateFrom, dateTo, posSales, marketplaceSales),
    topProducts: buildTopProducts(posSales, marketplaceSales),
    sales: buildSalesTable(posSales, marketplaceSales),
  };
}

const EXPORT_COLUMNS = [
  { header: 'Date', key: 'date', width: 22 },
  { header: 'Source', key: 'source', width: 14 },
  { header: 'Reference', key: 'reference', width: 28 },
  { header: 'Customer', key: 'customer', width: 24 },
  { header: 'Amount', key: 'amount', width: 16 },
  { header: 'Status', key: 'status', width: 14 },
];

/** Excel export (exceljs, dependency yang SUDAH ADA -- dipakai product-import, bukan dependency baru). Read-only, ikut filter periode aktif. */
export async function exportSalesReportExcel(params: SalesReportParams): Promise<Buffer> {
  const report = await getSalesReport(params);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sales Report');
  sheet.columns = EXPORT_COLUMNS;
  sheet.getRow(1).font = { bold: true };

  for (const row of report.sales) {
    sheet.addRow({
      date: new Date(row.date).toLocaleString('id-ID'),
      source: row.source === 'pos' ? 'POS' : 'Marketplace',
      reference: row.reference,
      customer: row.customer ?? '-',
      amount: row.totalAmount,
      status: row.status,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
