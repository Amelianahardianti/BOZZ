// backend/test/products.test.ts

// Menguji endpoint /api/products sesuai contracts/api.yaml:
// list (search/filter/pagination), create, detail, dan update.

import request from 'supertest';
import { app } from '../src/app';
import * as authService from '../src/modules/auth-product/service';

async function loginAs(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function ownerToken(): Promise<string> {
  return loginAs('owner', 'owner123');
}

async function kasirToken(): Promise<string> {
  await authService
    .createStaff({
      name: 'Kasir Produk',
      username: 'kasir-produk',
      password: 'kasir123',
      role: 'kasir',
      createdByUserId: 'seed-owner-1',
    })
    .catch(() => undefined); // sudah dibuat test sebelumnya -- tidak apa-apa
  return loginAs('kasir-produk', 'kasir123');
}

/** Bikin produk lewat API, kembalikan response-nya. */
async function createProduct(token: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Produk Uji', price: 10000, stock_qty: 5, ...overrides });
}

describe('GET /api/products', () => {
  it('menolak request tanpa token', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('membalas bentuk paginated { data, page, limit, total } dengan default page 1 limit 20', async () => {
    const token = await kasirToken();

    const res = await request(app).get('/api/products').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['data', 'limit', 'page', 'total']);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('menempelkan category_name hasil JOIN ke categories', async () => {
    const token = await kasirToken();

    const res = await request(app)
      .get('/api/products')
      .query({ search: 'Teh Botol' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].category_name).toBe('Minuman');
  });

  it('mencari berdasarkan potongan nama maupun SKU, tanpa peduli huruf besar/kecil', async () => {
    const token = await kasirToken();

    const byName = await request(app)
      .get('/api/products')
      .query({ search: 'roti' })
      .set('Authorization', `Bearer ${token}`);
    const bySku = await request(app)
      .get('/api/products')
      .query({ search: 'rtw-0' })
      .set('Authorization', `Bearer ${token}`);

    expect(byName.body.data.map((p: { name: string }) => p.name)).toContain('Roti Tawar');
    expect(bySku.body.data.map((p: { name: string }) => p.name)).toContain('Roti Tawar');
  });

  it('memfilter berdasarkan category_id', async () => {
    const token = await ownerToken();
    const minuman = await request(app)
      .get('/api/products')
      .query({ search: 'Teh Botol' })
      .set('Authorization', `Bearer ${token}`);
    const categoryId = minuman.body.data[0].category_id;

    const filtered = await request(app)
      .get('/api/products')
      .query({ category_id: categoryId })
      .set('Authorization', `Bearer ${token}`);

    expect(filtered.body.total).toBeGreaterThan(0);
    expect(
      filtered.body.data.every((p: { category_id: string }) => p.category_id === categoryId)
    ).toBe(true);
  });

  it('memfilter berdasarkan is_active, termasuk is_active=false', async () => {
    const token = await ownerToken();
    const created = await createProduct(token, { name: 'Produk Nonaktif', stock_qty: 0 });
    await request(app)
      .patch(`/api/products/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    const aktif = await request(app)
      .get('/api/products')
      .query({ is_active: 'true', limit: 100 })
      .set('Authorization', `Bearer ${token}`);
    expect(aktif.body.data.every((p: { is_active: boolean }) => p.is_active)).toBe(true);

    const nonaktif = await request(app)
      .get('/api/products')
      .query({ is_active: 'false' })
      .set('Authorization', `Bearer ${token}`);
    expect(nonaktif.body.data.map((p: { name: string }) => p.name)).toContain('Produk Nonaktif');
  });

  it('memotong hasil per halaman tapi total tetap jumlah seluruh hasil filter', async () => {
    const token = await ownerToken();

    const halaman1 = await request(app)
      .get('/api/products')
      .query({ page: 1, limit: 1 })
      .set('Authorization', `Bearer ${token}`);
    const halaman2 = await request(app)
      .get('/api/products')
      .query({ page: 2, limit: 1 })
      .set('Authorization', `Bearer ${token}`);

    expect(halaman1.body.data).toHaveLength(1);
    expect(halaman2.body.data).toHaveLength(1);
    expect(halaman1.body.data[0].id).not.toBe(halaman2.body.data[0].id);
    expect(halaman1.body.total).toBeGreaterThan(1);
    expect(halaman1.body.total).toBe(halaman2.body.total);
  });

  it('menolak limit di luar batas kontrak (1..100)', async () => {
    const token = await ownerToken();

    const res = await request(app)
      .get('/api/products')
      .query({ limit: 500 })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/products', () => {
  it('membuat produk baru dengan default low_stock_threshold 5', async () => {
    const token = await ownerToken();

    const res = await createProduct(token, { name: 'Kopi Sachet', sku: 'KPS-001', price: 2500 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Kopi Sachet');
    expect(res.body.low_stock_threshold).toBe(5);
    expect(res.body.is_active).toBe(true);
    expect(res.body.created_by).toBe('seed-owner-1');
    expect(res.body.category_id).toBeNull();
    expect(res.body.category_name).toBeNull();
  });

  it('menolak SKU yang sudah dipakai produk lain', async () => {
    const token = await ownerToken();
    await createProduct(token, { name: 'Produk SKU A', sku: 'DOBEL-01' });

    const res = await createProduct(token, { name: 'Produk SKU B', sku: 'dobel-01' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('menolak category_id yang tidak ada', async () => {
    const token = await ownerToken();

    const res = await createProduct(token, { category_id: 'kategori-hantu' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('menolak harga minus dan harga lebih dari 2 angka di belakang koma', async () => {
    const token = await ownerToken();

    expect((await createProduct(token, { price: -1 })).status).toBe(400);
    expect((await createProduct(token, { price: 1000.555 })).status).toBe(400);
  });

  it('melarang role selain owner menambah produk', async () => {
    const token = await kasirToken();

    const res = await createProduct(token, { name: 'Produk Dari Kasir' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/products/:id', () => {
  it('membalas detail produk lengkap dengan category_name', async () => {
    const token = await kasirToken();

    const res = await request(app)
      .get('/api/products/seed-product-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Roti Tawar');
    expect(res.body.category_name).toBe('Makanan');
  });

  it('membalas 404 kalau produknya tidak ada', async () => {
    const token = await kasirToken();

    const res = await request(app)
      .get('/api/products/produk-hantu')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/products/:id', () => {
  it('mengubah sebagian field dan membiarkan sisanya', async () => {
    const token = await ownerToken();
    const created = await createProduct(token, { name: 'Sebelum Diubah', price: 1000, unit: 'pcs' });

    const res = await request(app)
      .patch(`/api/products/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sesudah Diubah' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Sesudah Diubah');
    expect(res.body.price).toBe(1000);
    expect(res.body.unit).toBe('pcs');
    expect(res.body.stock_qty).toBe(created.body.stock_qty);
  });

  it('menolak perubahan stok lewat endpoint ini', async () => {
    const token = await ownerToken();

    const res = await request(app)
      .patch('/api/products/seed-product-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ stock_qty: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/stock-adjustments/);

    // stok beneran tidak berubah
    const after = await request(app)
      .get('/api/products/seed-product-1')
      .set('Authorization', `Bearer ${token}`);
    expect(after.body.stock_qty).not.toBe(999);
  });

  it('menolak body kosong', async () => {
    const token = await ownerToken();

    const res = await request(app)
      .patch('/api/products/seed-product-1')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('membalas 404 kalau produknya tidak ada', async () => {
    const token = await ownerToken();

    const res = await request(app)
      .patch('/api/products/produk-hantu')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Apa Saja' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('membiarkan produk memakai SKU-nya sendiri, tapi menolak SKU milik produk lain', async () => {
    const token = await ownerToken();
    const a = await createProduct(token, { name: 'Produk Patch A', sku: 'PATCH-A' });
    const b = await createProduct(token, { name: 'Produk Patch B', sku: 'PATCH-B' });

    const sendiri = await request(app)
      .patch(`/api/products/${a.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'PATCH-A', name: 'Produk Patch A1' });
    expect(sendiri.status).toBe(200);

    const bentrok = await request(app)
      .patch(`/api/products/${a.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sku: 'PATCH-B' });
    expect(bentrok.status).toBe(409);
    expect(bentrok.body.error.message).toContain(b.body.name);
  });

  it('melarang role selain owner mengubah produk', async () => {
    const token = await kasirToken();

    const res = await request(app)
      .patch('/api/products/seed-product-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Diubah Kasir' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
