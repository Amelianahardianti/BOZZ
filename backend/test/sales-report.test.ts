// backend/test/sales-report.test.ts

// TASK 13A — Sales Report MVP. HTTP asli lewat supertest (Docker
// Postgres asli, lihat backend/.env.test + src/shared/testDbSafety.ts).
//
// Setiap test scenario memakai TANGGAL TETAP di masa lalu (2019-2020,
// bulan/hari beda per test) yang TIDAK PERNAH disentuh seed data lain
// atau test file lain -- jadi assertion di sini bisa ABSOLUT (bukan pola
// delta seperti dashboard.test.ts), karena datanya sudah pasti terisolasi
// oleh filter tanggal laporan itu sendiri, tanpa perlu hitung
// sebelum/sesudah.

import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import { app } from '../src/app';
import { prisma } from '../src/shared/db';
import { ownerToken, staffToken } from './helpers/auth';

function reportUrl(dateFrom?: string, dateTo?: string): string {
  const qs = new URLSearchParams();
  if (dateFrom) qs.set('date_from', dateFrom);
  if (dateTo) qs.set('date_to', dateTo);
  const suffix = qs.toString();
  return `/api/reports/sales${suffix ? `?${suffix}` : ''}`;
}

function getReport(dateFrom?: string, dateTo?: string) {
  return request(app).get(reportUrl(dateFrom, dateTo)).set('Authorization', `Bearer ${ownerToken()}`);
}

async function seedProduct(overrides: Record<string, unknown> = {}): Promise<{ id: string; name: string; price: number }> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ name: `TEST-REPORT-${randomUUID()}`, price: 10000, stock_qty: 1000, ...overrides });
  expect(res.status).toBe(201);
  return res.body;
}

function checkout(body: Record<string, unknown>) {
  return request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${staffToken('kasir')}`)
    .set('Idempotency-Key', randomUUID())
    .send(body);
}

/** Bikin transaksi POS 'completed' lalu pindahkan created_at-nya ke tanggal tetap masa lalu (pola sama seperti dashboard.test.ts). */
async function posSaleAt(isoDate: string, items: { product_id: string; qty: number }[]): Promise<{ id: string; totalAmount: number }> {
  const res = await checkout({ type: 'walk_in', payment_method: 'transfer', items });
  expect(res.status).toBe(201);
  await prisma.transactions.update({ where: { id: res.body.id }, data: { created_at: new Date(`${isoDate}T10:00:00`) } });
  return { id: res.body.id, totalAmount: res.body.total_amount };
}

async function voidTransaction(id: string) {
  const res = await request(app)
    .patch(`/api/transactions/${id}/void`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({});
  expect(res.status).toBe(200);
}

async function marketplaceOrderAt(opts: {
  isoDate: string;
  totalAmount: number;
  status?: string;
  items?: { productId: string | null; itemName: string; qty: number; unitPrice: number }[];
}): Promise<string> {
  const platform =
    (await prisma.platforms.findFirst({ orderBy: { platform_name: 'asc' } })) ??
    (await prisma.platforms.create({ data: { platform_name: 'fakestore', is_connected: false } }));

  const order = await prisma.external_orders.create({
    data: {
      platform_id: platform.id,
      external_order_id: `TEST-REPORT-${randomUUID()}`,
      status: opts.status ?? 'new',
      sla_type: 'reguler',
      total_amount: opts.totalAmount,
      received_at: new Date(`${opts.isoDate}T10:00:00`),
      external_order_items: opts.items
        ? {
            create: opts.items.map((i) => ({
              product_id: i.productId,
              item_name_snapshot: i.itemName,
              qty: i.qty,
              unit_price: i.unitPrice,
            })),
          }
        : undefined,
    },
  });
  return order.id;
}

describe('GET /api/reports/sales (Task 13A)', () => {
  it('Test 1 -- Owner bisa akses, 200, shape response lengkap', async () => {
    const res = await getReport();

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['period', 'sales', 'summary', 'topProducts', 'trend'].sort());
    expect(Object.keys(res.body.summary).sort()).toEqual(
      ['totalSalesAmount', 'posSalesAmount', 'marketplaceSalesAmount', 'totalTransactions', 'posTransactions', 'marketplaceOrders'].sort()
    );
  });

  it('Test 2 -- kasir & pengepak dilarang akses -> 403', async () => {
    const kasirRes = await request(app).get(reportUrl()).set('Authorization', `Bearer ${staffToken('kasir')}`);
    expect(kasirRes.status).toBe(403);

    const pengepakRes = await request(app).get(reportUrl()).set('Authorization', `Bearer ${staffToken('pengepak')}`);
    expect(pengepakRes.status).toBe(403);
  });

  it('Test 2b -- tanpa token -> 401', async () => {
    const res = await request(app).get(reportUrl());
    expect(res.status).toBe(401);
  });

  it('Test 3 -- POS sale completed dihitung penuh ke summary & sales table', async () => {
    const produk = await seedProduct({ price: 25000 });
    const sale = await posSaleAt('2020-06-01', [{ product_id: produk.id, qty: 2 }]);

    const res = await getReport('2020-06-01', '2020-06-01');

    expect(res.body.summary.posSalesAmount).toBe(50000);
    expect(res.body.summary.posTransactions).toBe(1);
    expect(res.body.summary.totalSalesAmount).toBe(50000);
    expect(res.body.sales).toHaveLength(1);
    expect(res.body.sales[0]).toMatchObject({ id: sale.id, source: 'pos', totalAmount: 50000, status: 'completed' });
  });

  it('Test 4 -- POS sale voided TIDAK dihitung sama sekali', async () => {
    const produk = await seedProduct({ price: 30000 });
    const sale = await posSaleAt('2020-06-02', [{ product_id: produk.id, qty: 1 }]);
    await voidTransaction(sale.id);

    const res = await getReport('2020-06-02', '2020-06-02');

    expect(res.body.summary.posSalesAmount).toBe(0);
    expect(res.body.summary.posTransactions).toBe(0);
    expect(res.body.summary.totalSalesAmount).toBe(0);
    expect(res.body.sales).toHaveLength(0);
  });

  it('Test 5 -- Marketplace order cancelled TIDAK dihitung, status lain dihitung', async () => {
    await marketplaceOrderAt({ isoDate: '2020-06-03', totalAmount: 999999, status: 'cancelled' });
    await marketplaceOrderAt({ isoDate: '2020-06-03', totalAmount: 75000, status: 'processing' });

    const res = await getReport('2020-06-03', '2020-06-03');

    expect(res.body.summary.marketplaceSalesAmount).toBe(75000);
    expect(res.body.summary.marketplaceOrders).toBe(1);
  });

  it('Test 6 -- date filter: order di luar rentang tidak ikut masuk', async () => {
    await marketplaceOrderAt({ isoDate: '2020-06-05', totalAmount: 111111, status: 'new' }); // di luar rentang
    await marketplaceOrderAt({ isoDate: '2020-06-10', totalAmount: 40000, status: 'new' }); // di dalam rentang

    const res = await getReport('2020-06-08', '2020-06-12');

    expect(res.body.summary.marketplaceSalesAmount).toBe(40000);
    expect(res.body.summary.marketplaceOrders).toBe(1);
  });

  it('Test 7 -- trend aggregation harian benar, termasuk hari kosong (zero-fill)', async () => {
    await marketplaceOrderAt({ isoDate: '2020-06-15', totalAmount: 100, status: 'new' });
    await marketplaceOrderAt({ isoDate: '2020-06-16', totalAmount: 200, status: 'new' });
    // 2020-06-17 sengaja dikosongkan -- harus tetap muncul dengan sales 0.

    const res = await getReport('2020-06-15', '2020-06-17');

    expect(res.body.trend).toEqual([
      { date: '2020-06-15', posSales: 0, marketplaceSales: 100, totalSales: 100 },
      { date: '2020-06-16', posSales: 0, marketplaceSales: 200, totalSales: 200 },
      { date: '2020-06-17', posSales: 0, marketplaceSales: 0, totalSales: 0 },
    ]);
  });

  it('Test 8 -- top products urut quantitySold DESC', async () => {
    const produkA = await seedProduct({ price: 5000 });
    const produkB = await seedProduct({ price: 5000 });
    await posSaleAt('2020-06-20', [{ product_id: produkA.id, qty: 3 }]);
    await posSaleAt('2020-06-20', [{ product_id: produkB.id, qty: 7 }]);

    const res = await getReport('2020-06-20', '2020-06-20');

    expect(res.body.topProducts[0]).toMatchObject({ productId: produkB.id, quantitySold: 7 });
    expect(res.body.topProducts[1]).toMatchObject({ productId: produkA.id, quantitySold: 3 });
  });

  it('Test 9 -- marketplace item TANPA product mapping: masuk total sales, TIDAK masuk Top Products', async () => {
    const produkMapped = await seedProduct({ price: 1000 });
    await marketplaceOrderAt({
      isoDate: '2020-06-25',
      totalAmount: 90000,
      status: 'new',
      items: [
        { productId: produkMapped.id, itemName: 'Produk BOZZ', qty: 2, unitPrice: 1000 },
        { productId: null, itemName: 'Raw FakeStore Title', qty: 50, unitPrice: 1760 }, // qty besar sengaja -- kalau BUG bakal muncul di top #1
      ],
    });

    const res = await getReport('2020-06-25', '2020-06-25');

    expect(res.body.summary.marketplaceSalesAmount).toBe(90000);
    const ids = res.body.topProducts.map((p: { productId: string }) => p.productId);
    expect(ids).toContain(produkMapped.id);
    expect(res.body.topProducts.find((p: { productName: string }) => p.productName === 'Raw FakeStore Title')).toBeUndefined();
  });

  it('Test 10 -- periode kosong: 0 di semua angka, array kosong, tidak crash', async () => {
    const res = await getReport('2019-01-01', '2019-01-02');

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({
      totalSalesAmount: 0,
      posSalesAmount: 0,
      marketplaceSalesAmount: 0,
      totalTransactions: 0,
      posTransactions: 0,
      marketplaceOrders: 0,
    });
    expect(res.body.sales).toEqual([]);
    expect(res.body.topProducts).toEqual([]);
    expect(res.body.trend).toEqual([
      { date: '2019-01-01', posSales: 0, marketplaceSales: 0, totalSales: 0 },
      { date: '2019-01-02', posSales: 0, marketplaceSales: 0, totalSales: 0 },
    ]);
  });

  it('Test 11 -- default range (tanpa filter) tidak crash & period-nya 30 hari terakhir', async () => {
    const res = await getReport();

    expect(res.status).toBe(200);
    const { dateFrom, dateTo } = res.body.period;
    const hari = (Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000;
    expect(hari).toBe(29); // 30 hari inklusif = selisih 29 hari
  });
});

describe('GET /api/reports/sales/export.xlsx (Task 13A)', () => {
  it('Owner bisa export, dapat file xlsx (bukan JSON)', async () => {
    const produk = await seedProduct({ price: 40000 });
    await posSaleAt('2020-06-01', [{ product_id: produk.id, qty: 1 }]);

    const res = await request(app)
      .get('/api/reports/sales/export.xlsx?date_from=2020-06-01&date_to=2020-06-01')
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  });

  it('kasir dilarang export -> 403', async () => {
    const res = await request(app)
      .get('/api/reports/sales/export.xlsx')
      .set('Authorization', `Bearer ${staffToken('kasir')}`);
    expect(res.status).toBe(403);
  });
});
