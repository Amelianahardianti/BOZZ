// backend/test/transaction-reports.test.ts

// Menguji GET /api/transactions (halaman Laporan) dan
// GET /api/transactions/:id (data struk), sesuai contracts/api.yaml.

import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { OWNER_ID, ownerToken, staffToken } from './helpers/auth';
import { bikinCustomer } from './helpers/fixtures';
import { describe, expect, it, jest } from '@jest/globals';

async function seedProduct(token: string, stockQty = 50, price = 10000): Promise<string> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Produk Laporan ${randomUUID()}`, price, stock_qty: stockQty });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function checkout(
  token: string,
  productId: string,
  body: Record<string, unknown> = {}
): Promise<Record<string, never> & { id: string; created_at: string }> {
  const res = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', randomUUID())
    .send({
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: productId, qty: 1 }],
      ...body,
    });
  expect(res.status).toBe(201);
  return res.body;
}

function listTransactions(token: string, query: Record<string, unknown> = {}) {
  return request(app)
    .get('/api/transactions')
    .query(query)
    .set('Authorization', `Bearer ${token}`);
}

describe('GET /api/transactions', () => {
  it('menolak request tanpa token dan melarang pengepak', async () => {
    const tanpaToken = await request(app).get('/api/transactions');
    expect(tanpaToken.status).toBe(401);

    const pengepak = await listTransactions(staffToken('pengepak'));
    expect(pengepak.status).toBe(403);
    expect(pengepak.body.error.code).toBe('FORBIDDEN');
  });

  it('membalas bentuk paginated { data, page, limit, total } dengan default page 1 limit 20', async () => {
    const token = ownerToken();
    await checkout(token, await seedProduct(token));

    const res = await listTransactions(token);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['data', 'limit', 'page', 'total']);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('mengurutkan dari transaksi terbaru dan tidak membocorkan field internal', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token);

    const lama = await checkout(token, productId);
    const baru = await checkout(token, productId);

    const res = await listTransactions(token, { limit: 100 });
    const ids = res.body.data.map((t: { id: string }) => t.id);

    expect(ids.indexOf(baru.id)).toBeLessThan(ids.indexOf(lama.id));
    expect(res.body.data[0].request_fingerprint).toBeUndefined();
    expect(res.body.data[0].items).toBeDefined();
  });

  it('memfilter berdasarkan payment_method', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token);

    const tunai = await checkout(token, productId, {
      payment_method: 'cash',
      amount_paid: 20000,
    });
    await checkout(token, productId, { payment_method: 'ewallet' });

    const res = await listTransactions(token, { payment_method: 'cash', limit: 100 });

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(
      res.body.data.every((t: { payment_method: string }) => t.payment_method === 'cash')
    ).toBe(true);
    expect(res.body.data.map((t: { id: string }) => t.id)).toContain(tunai.id);
  });

  it('memfilter berdasarkan customer_type: ada pelanggan = marketplace, tanpa = walk_in', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token);
    const customerId = await bikinCustomer();

    const denganPelanggan = await checkout(token, productId, { customer_id: customerId });
    const tanpaPelanggan = await checkout(token, productId);

    const marketplace = await listTransactions(token, {
      customer_type: 'marketplace',
      limit: 100,
    });
    expect(marketplace.body.data.map((t: { id: string }) => t.id)).toContain(denganPelanggan.id);
    expect(marketplace.body.data.map((t: { id: string }) => t.id)).not.toContain(
      tanpaPelanggan.id
    );
    expect(
      marketplace.body.data.every((t: { customer_id: string | null }) => t.customer_id !== null)
    ).toBe(true);

    const walkIn = await listTransactions(token, { customer_type: 'walk_in', limit: 100 });
    expect(walkIn.body.data.map((t: { id: string }) => t.id)).toContain(tanpaPelanggan.id);
    expect(
      walkIn.body.data.every((t: { customer_id: string | null }) => t.customer_id === null)
    ).toBe(true);
  });

  it('memfilter rentang tanggal, termasuk transaksi hari ini di batas atas', async () => {
    const token = ownerToken();
    const baru = await checkout(token, await seedProduct(token));

    const hariIni = new Date();
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
    const kemarin = new Date(hariIni);
    kemarin.setDate(kemarin.getDate() - 1);
    const besok = new Date(hariIni);
    besok.setDate(besok.getDate() + 1);

    // date_to = hari ini harus tetap memuat transaksi barusan
    const termasuk = await listTransactions(token, {
      date_from: iso(kemarin),
      date_to: iso(hariIni),
      limit: 100,
    });
    expect(termasuk.body.data.map((t: { id: string }) => t.id)).toContain(baru.id);

    // rentang yang seluruhnya di masa depan tidak memuat apa pun
    const kosong = await listTransactions(token, { date_from: iso(besok), limit: 100 });
    expect(kosong.body.total).toBe(0);
  });

  it('menolak format tanggal yang salah dan rentang terbalik', async () => {
    const token = ownerToken();

    const formatSalah = await listTransactions(token, { date_from: '31-08-2026' });
    expect(formatSalah.status).toBe(400);
    expect(formatSalah.body.error.code).toBe('VALIDATION_ERROR');

    const terbalik = await listTransactions(token, {
      date_from: '2026-08-31',
      date_to: '2026-08-01',
    });
    expect(terbalik.status).toBe(400);
    expect(terbalik.body.error.message).toMatch(/date_to/);
  });

  it('menolak payment_method & customer_type di luar daftar, dan limit di luar 1..100', async () => {
    const token = ownerToken();

    expect((await listTransactions(token, { payment_method: 'qris' })).status).toBe(400);
    expect((await listTransactions(token, { customer_type: 'pre_order' })).status).toBe(400);
    expect((await listTransactions(token, { limit: 101 })).status).toBe(400);
    expect((await listTransactions(token, { page: 0 })).status).toBe(400);
  });

  it('memotong hasil per halaman, total tetap jumlah seluruh hasil filter', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token);
    await checkout(token, productId);
    await checkout(token, productId);

    const halaman1 = await listTransactions(token, { page: 1, limit: 1 });
    const halaman2 = await listTransactions(token, { page: 2, limit: 1 });

    expect(halaman1.body.data).toHaveLength(1);
    expect(halaman2.body.data).toHaveLength(1);
    expect(halaman1.body.data[0].id).not.toBe(halaman2.body.data[0].id);
    expect(halaman1.body.total).toBe(halaman2.body.total);
    expect(halaman1.body.total).toBeGreaterThan(1);
  });
});

describe('GET /api/transactions/:id', () => {
  it('membalas data lengkap untuk struk', async () => {
    const owner = ownerToken();
    const productId = await seedProduct(owner, 10, 12500);
    const kasir = staffToken('kasir');

    const dibuat = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${kasir}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'walk_in',
        payment_method: 'cash',
        amount_paid: 50000,
        items: [{ product_id: productId, qty: 2 }],
      });
    expect(dibuat.status).toBe(201);

    const res = await request(app)
      .get(`/api/transactions/${dibuat.body.id}`)
      .set('Authorization', `Bearer ${kasir}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(dibuat.body.id);
    expect(res.body.total_amount).toBe(25000);
    expect(res.body.amount_paid).toBe(50000);
    expect(res.body.change_amount).toBe(25000);
    expect(res.body.status).toBe('completed');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].qty).toBe(2);
    expect(res.body.items[0].unit_price).toBe(12500);
    expect(res.body.items[0].product_name_snapshot).toBeTruthy();
    expect(res.body.request_fingerprint).toBeUndefined();
  });

  it('struk lama tetap memakai harga saat transaksi walau harga produk berubah', async () => {
    const owner = ownerToken();
    const productId = await seedProduct(owner, 10, 3000);
    const dibuat = await checkout(owner, productId);

    await request(app)
      .patch(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ price: 77000, name: 'Nama Baru Setelah Transaksi' });

    const res = await request(app)
      .get(`/api/transactions/${dibuat.id}`)
      .set('Authorization', `Bearer ${owner}`);

    expect(res.body.items[0].unit_price).toBe(3000);
    expect(res.body.items[0].product_name_snapshot).not.toBe('Nama Baru Setelah Transaksi');
    expect(res.body.total_amount).toBe(3000);
  });

  it('membalas 404 kalau transaksinya tidak ada', async () => {
    const token = ownerToken();

    const res = await request(app)
      .get('/api/transactions/transaksi-hantu')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('menolak request tanpa token dan melarang pengepak', async () => {
    const owner = ownerToken();
    const dibuat = await checkout(owner, await seedProduct(owner));

    const tanpaToken = await request(app).get(`/api/transactions/${dibuat.id}`);
    expect(tanpaToken.status).toBe(401);

    const pengepak = await request(app)
      .get(`/api/transactions/${dibuat.id}`)
      .set('Authorization', `Bearer ${staffToken('pengepak')}`);
    expect(pengepak.status).toBe(403);
  });
});
