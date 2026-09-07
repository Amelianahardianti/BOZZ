// backend/test/dashboard.test.ts

// TASK 12A.2 — Dashboard MVP. Pola test SAMA seperti
// test/ticket-handover-stock.test.ts: HTTP asli lewat supertest (bukan
// panggil service/repository langsung untuk endpoint-nya), auth-product
// di-mock (dibutuhkan rute POST /tickets yang lookup pengepak),
// sales-inventory & ecommerce-sync TIDAK di-mock -- Docker Postgres asli
// (lihat backend/.env.test + src/shared/testDbSafety.ts).
//
// PENTING soal angka: dashboard membaca LINTAS SELURUH tabel (products,
// transactions, external_orders, tickets, stock_adjustments).
// jest.config.js sengaja `maxWorkers: 1` supaya TIDAK ADA file test lain
// yang menulis ke database DI TENGAH-TENGAH eksekusi test file ini --
// tapi baris SISA dari file test lain yang jalan LEBIH DULU di run yang
// sama (banyak yang tidak membersihkan diri sendiri) tetap ada di
// database sampai npm run test berikutnya. Karena itu SELURUH assertion
// angka di sini memakai pola DELTA (dashboard SEBELUM vs SESUDAH),
// BUKAN nilai absolut.

import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { app } from '../src/app';
import { prisma } from '../src/shared/db';
import * as authRepo from '../src/modules/auth-product/repository';
import type { User } from '../src/modules/auth-product/repository';
import * as dashboardRepo from '../src/modules/dashboard/repository';
import { ownerToken, staffToken } from './helpers/auth';
import { pinjamAkun, siapkanKolamAkun } from './helpers/fixtures';

jest.mock('../src/modules/auth-product/repository');
const mockedAuthRepo = authRepo as jest.Mocked<typeof authRepo>;

beforeAll(async () => {
  await siapkanKolamAkun();
});

afterEach(() => {
  jest.resetAllMocks();
});

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: pinjamAkun(),
    name: 'Pengepak Uji Dashboard',
    email_or_username: 'pengepak-dashboard',
    password_hash: '$2a$10$tidakDipakaiLangsungDiTest.................',
    role: 'pengepak',
    phone: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockUsers(...users: User[]): void {
  mockedAuthRepo.findById.mockImplementation(async (id: string) => users.find((u) => u.id === id) ?? null);
}

function getDashboard(token: string) {
  return request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
}

async function seedProduct(overrides: Record<string, unknown> = {}): Promise<{ id: string; name: string; price: number }> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ name: `TEST-DASH-${randomUUID()}`, price: 10000, stock_qty: 10, ...overrides });
  expect(res.status).toBe(201);
  return res.body;
}

function checkout(token: string, body: Record<string, unknown>) {
  return request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', randomUUID())
    .send(body);
}

function adjustStock(productId: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/products/${productId}/stock-adjustments`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send(body);
}

/** Order penunjang dengan total_amount & status bisa diatur bebas -- dipakai khusus test marketplace summary. */
async function bikinOrderDenganNilai(totalAmount: number, status: string): Promise<string> {
  const platform =
    (await prisma.platforms.findFirst({ orderBy: { platform_name: 'asc' } })) ??
    (await prisma.platforms.create({ data: { platform_name: 'fakestore', is_connected: false } }));

  const order = await prisma.external_orders.create({
    data: {
      platform_id: platform.id,
      external_order_id: `TEST-DASH-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      status,
      sla_type: 'reguler',
      total_amount: totalAmount,
    },
  });
  return order.id;
}

interface TicketItemBody {
  id: string;
  product_id: string;
  qty: number;
  is_packed: boolean;
}

async function createTicketFor(items: { productId: string; qty: number }[]): Promise<{
  id: string;
  items: TicketItemBody[];
}> {
  const pengepak = buildUser();
  mockUsers(pengepak);
  const orderId = await bikinOrderDenganNilai(0, 'new');

  const res = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({
      external_order_id: orderId,
      assigned_to_user_id: pengepak.id,
      items: items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    });
  expect(res.status).toBe(201);
  return { id: res.body.id, items: res.body.items };
}

function ubahTiketStatus(ticketId: string, body: Record<string, unknown>) {
  return request(app).patch(`/api/tickets/${ticketId}/status`).set('Authorization', `Bearer ${ownerToken()}`).send(body);
}

async function handOverTicket(ticket: { id: string; items: TicketItemBody[] }): Promise<void> {
  const pack = await ubahTiketStatus(ticket.id, { ticket_items: ticket.items.map((i) => ({ id: i.id, is_packed: true })) });
  expect(pack.status).toBe(200);
  const handover = await ubahTiketStatus(ticket.id, { status: 'handed_over' });
  expect(handover.status).toBe(200);
}

describe('GET /api/dashboard (Task 12A.2)', () => {
  it('Test 1 -- Owner bisa akses dashboard, 200, shape response lengkap', async () => {
    const res = await getDashboard(ownerToken());

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['lowStock', 'overview', 'recentStockActivity', 'tickets']);
    expect(Object.keys(res.body.overview).sort()).toEqual(
      [
        'totalProducts',
        'activeProducts',
        'lowStockProducts',
        'todayPosSales',
        'todayPosTransactions',
        'marketplaceOrders',
        'marketplaceOrderValue',
      ].sort()
    );
    expect(Object.keys(res.body.tickets).sort()).toEqual(
      ['unassigned', 'assigned', 'packing', 'packed', 'handedOver'].sort()
    );
    expect(Array.isArray(res.body.lowStock)).toBe(true);
    expect(Array.isArray(res.body.recentStockActivity)).toBe(true);
  });

  it('Test 2 -- kasir dilarang akses dashboard -> 403', async () => {
    const res = await getDashboard(staffToken('kasir'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Test 2b -- pengepak dilarang akses dashboard -> 403', async () => {
    const res = await getDashboard(staffToken('pengepak'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Test 2c -- tanpa token -> 401', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });

  it('Test 3 -- product overview: totalProducts & activeProducts bertambah sesuai produk yang dibuat', async () => {
    const before = (await getDashboard(ownerToken())).body.overview;

    await seedProduct();
    await seedProduct();
    const produkNonaktif = await seedProduct();
    const patchRes = await request(app)
      .patch(`/api/products/${produkNonaktif.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ is_active: false });
    expect(patchRes.status).toBe(200);

    const after = (await getDashboard(ownerToken())).body.overview;

    expect(after.totalProducts - before.totalProducts).toBe(3);
    expect(after.activeProducts - before.activeProducts).toBe(2);
  });

  it('Test 4 -- low stock: stock_qty <= low_stock_threshold, produk nonaktif TIDAK ikut', async () => {
    const rendah = await seedProduct({ stock_qty: 3, low_stock_threshold: 5 });
    const cukup = await seedProduct({ stock_qty: 10, low_stock_threshold: 5 });
    const rendahTapiNonaktif = await seedProduct({ stock_qty: 1, low_stock_threshold: 5 });
    const nonaktifRes = await request(app)
      .patch(`/api/products/${rendahTapiNonaktif.id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ is_active: false });
    expect(nonaktifRes.status).toBe(200);

    // Limit besar dipakai LANGSUNG ke repository (bukan lewat endpoint
    // dashboard yang MEMANG dibatasi 5 demi MVP) -- supaya assertion di
    // sini tidak tergantung berapa banyak baris low-stock SISA dari file
    // test lain yang kebetulan jalan lebih dulu di run yang sama (lihat
    // catatan pola DELTA di atas file ini).
    const { items } = await dashboardRepo.getLowStockProducts(10000);
    const ids = items.map((i) => i.id);

    expect(ids).toContain(rendah.id);
    expect(ids).not.toContain(cukup.id);
    expect(ids).not.toContain(rendahTapiNonaktif.id);

    const ditemukan = items.find((i) => i.id === rendah.id)!;
    expect(ditemukan.stockQty).toBe(3);
    expect(ditemukan.lowStockThreshold).toBe(5);

    // Endpoint publik dibatasi maksimal 5 baris.
    const res = await getDashboard(ownerToken());
    expect(res.body.lowStock.length).toBeLessThanOrEqual(5);
  });

  it("Test 5 -- today's POS sales: completed hari ini masuk, voided & hari sebelumnya dikeluarkan", async () => {
    const before = (await getDashboard(ownerToken())).body.overview;

    const produk = await seedProduct({ price: 15000, stock_qty: 50 });
    const kasir = staffToken('kasir');

    const selesai = await checkout(kasir, {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 2 }],
    });
    expect(selesai.status).toBe(201);

    const dibatalkan = await checkout(kasir, {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 1 }],
    });
    expect(dibatalkan.status).toBe(201);
    const voidRes = await request(app)
      .patch(`/api/transactions/${dibatalkan.body.id}/void`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({});
    expect(voidRes.status).toBe(200);

    const kemarin = await checkout(kasir, {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 3 }],
    });
    expect(kemarin.status).toBe(201);
    const satuHariLalu = new Date();
    satuHariLalu.setDate(satuHariLalu.getDate() - 1);
    await prisma.transactions.update({ where: { id: kemarin.body.id }, data: { created_at: satuHariLalu } });

    const after = (await getDashboard(ownerToken())).body.overview;

    expect(after.todayPosTransactions - before.todayPosTransactions).toBe(1);
    expect(after.todayPosSales - before.todayPosSales).toBe(selesai.body.total_amount);
  });

  it('Test 6 -- ticket status count: semua state ada, hitungan sesuai transisi yang dilakukan', async () => {
    const before = (await getDashboard(ownerToken())).body.tickets;

    const produkA = await seedProduct({ stock_qty: 100 });
    const produkB = await seedProduct({ stock_qty: 100 });
    const produkC = await seedProduct({ stock_qty: 100 });
    const produkD = await seedProduct({ stock_qty: 100 });

    // A -- dibiarkan di 'assigned' (status awal ticket baru, lihat
    // repository.createTicket: selalu langsung 'assigned', TIDAK PERNAH
    // lewat 'unassigned' -- state itu tidak tercapai lewat jalur mana
    // pun di aplikasi saat ini, cuma tersedia di skema).
    await createTicketFor([{ productId: produkA.id, qty: 1 }]);

    // B -- 'packing'.
    const ticketB = await createTicketFor([{ productId: produkB.id, qty: 1 }]);
    const pindahB = await ubahTiketStatus(ticketB.id, { status: 'packing' });
    expect(pindahB.status).toBe(200);

    // C -- 'packed'.
    const ticketC = await createTicketFor([{ productId: produkC.id, qty: 1 }]);
    await ubahTiketStatus(ticketC.id, { status: 'packing' });
    const pindahC = await ubahTiketStatus(ticketC.id, { status: 'packed' });
    expect(pindahC.status).toBe(200);

    // D -- 'handed_over' (lewat jalur packAllItems + handover asli, sama
    // seperti test/ticket-handover-stock.test.ts).
    const ticketD = await createTicketFor([{ productId: produkD.id, qty: 1 }]);
    await handOverTicket(ticketD);

    const after = (await getDashboard(ownerToken())).body.tickets;

    expect(after.unassigned - before.unassigned).toBe(0);
    expect(after.assigned - before.assigned).toBe(1);
    expect(after.packing - before.packing).toBe(1);
    expect(after.packed - before.packed).toBe(1);
    expect(after.handedOver - before.handedOver).toBe(1);
  });

  it('Test 7 -- recent stock activity: urut terbaru dulu, nama produk resolved, limit 5 diterapkan', async () => {
    const produk = await seedProduct({ price: 20000, stock_qty: 100 });
    const kasir = staffToken('kasir');

    // Ditulis satu-satu berurutan (bukan Promise.all) supaya
    // created_at-nya pasti naik monoton -- dibutuhkan buat assertion
    // urutan "terbaru dulu" di bawah.
    const restock1 = await adjustStock(produk.id, { change_qty: 5, reason: 'restock' });
    expect(restock1.status).toBe(201);

    const jual = await checkout(kasir, {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 1 }],
    });
    expect(jual.status).toBe(201);

    const ticket = await createTicketFor([{ productId: produk.id, qty: 2 }]);
    await handOverTicket(ticket);

    // 3 restock tambahan supaya total tulisan baru (restock1, jual,
    // handover, +3 restock = 6) melebihi limit 5 -- membuktikan LIMIT
    // beneran diterapkan, bukan cuma "kebetulan sedikit data".
    const restockTambahan: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await adjustStock(produk.id, { change_qty: 1, reason: 'restock' });
      expect(res.status).toBe(201);
      restockTambahan.push(res.body.id as string);
    }

    const res = await getDashboard(ownerToken());
    const activity = res.body.recentStockActivity as Array<{
      id: string;
      productId: string;
      productName: string;
      reason: string;
      referenceType: string | null;
    }>;

    expect(activity.length).toBe(5);

    // 3 baris teratas = 3 restock tambahan, urutan terbalik dari
    // penulisannya (created_at DESC). restock1 (baris PALING PERTAMA
    // ditulis) harus sudah terdesak keluar dari 5 besar.
    expect(activity.slice(0, 3).map((a) => a.id)).toEqual([...restockTambahan].reverse());
    expect(activity.map((a) => a.id)).not.toContain(restock1.body.id);

    const barisHandover = activity.find((a) => a.reason === 'external_order');
    expect(barisHandover).toBeDefined();
    expect(barisHandover!.productId).toBe(produk.id);
    expect(barisHandover!.productName).toBe(produk.name);

    const barisJual = activity.find((a) => a.reason === 'sale');
    expect(barisJual).toBeDefined();
    expect(barisJual!.productId).toBe(produk.id);
  });

  it('Test 8 (opsional) -- marketplace summary: value mengecualikan cancelled, count menghitung semua', async () => {
    const before = (await getDashboard(ownerToken())).body.overview;

    await bikinOrderDenganNilai(100000, 'new');
    await bikinOrderDenganNilai(50000, 'processing');
    await bikinOrderDenganNilai(999999, 'cancelled');

    const after = (await getDashboard(ownerToken())).body.overview;

    expect(after.marketplaceOrders - before.marketplaceOrders).toBe(3);
    expect(after.marketplaceOrderValue - before.marketplaceOrderValue).toBe(150000);
  });

  it('Test empty-safety -- database nyaris kosong tidak membuat response crash/NaN/undefined', async () => {
    const res = await getDashboard(ownerToken());

    expect(res.status).toBe(200);
    expect(Number.isNaN(res.body.overview.todayPosSales)).toBe(false);
    expect(Number.isNaN(res.body.overview.marketplaceOrderValue)).toBe(false);
    expect(res.body.overview.todayPosSales).not.toBeUndefined();
    expect(res.body.overview.marketplaceOrderValue).not.toBeUndefined();
    for (const key of ['unassigned', 'assigned', 'packing', 'packed', 'handedOver']) {
      expect(res.body.tickets[key]).not.toBeUndefined();
      expect(Number.isNaN(res.body.tickets[key])).toBe(false);
    }
  });
});
