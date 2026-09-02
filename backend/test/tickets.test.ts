// backend/test/tickets.test.ts

// Menguji POST /api/tickets: bikin ticket packing dari sebuah order
// marketplace, ditugaskan ke satu Pengepak (FR-SI-10).

import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, expect, it } from '@jest/globals';
import { app } from '../src/app';
import * as authService from '../src/modules/auth-product/service';
import { OWNER_ID, ownerToken, staffToken } from './helpers/auth';

/**
 * Bikin akun staf beneran lewat modul auth-product, karena yang diuji di
 * sini justru pengecekan "tujuannya ada, aktif, dan rolenya pengepak".
 * Token dari helper tidak cukup -- itu cuma JWT, tanpa baris user.
 */
async function seedStaff(role: 'pengepak' | 'kasir'): Promise<{ id: string; name: string }> {
  return authService.createStaff({
    name: `Staf ${role} ${randomUUID().slice(0, 8)}`,
    email_or_username: `staf-${randomUUID()}`,
    password: 'rahasia123',
    role,
    createdByUserId: OWNER_ID,
  });
}

async function seedProduct(token: string, name = `Produk Ticket ${randomUUID()}`): Promise<string> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, price: 10000, stock_qty: 20 });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

function createTicket(token: string, body: Record<string, unknown>) {
  return request(app).post('/api/tickets').set('Authorization', `Bearer ${token}`).send(body);
}

describe('POST /api/tickets', () => {
  it('membuat ticket dari order dan menugaskannya ke satu Pengepak', async () => {
    const token = ownerToken();
    const pengepak = await seedStaff('pengepak');
    const productId = await seedProduct(token, 'Sabun Batang');
    const orderId = randomUUID();

    const res = await createTicket(token, {
      external_order_id: orderId,
      assigned_to_user_id: pengepak.id,
      notes: 'Bungkus pakai bubble wrap',
      items: [{ product_id: productId, qty: 2 }],
    });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'assigned_at',
      'assigned_by',
      'assigned_to_user_id',
      'completed_at',
      'created_at',
      'external_order_id',
      'id',
      'items',
      'notes',
      'status',
      'updated_at',
    ]);
    expect(res.body.external_order_id).toBe(orderId);
    expect(res.body.assigned_to_user_id).toBe(pengepak.id);
    expect(res.body.assigned_by).toBe(OWNER_ID);
    expect(res.body.assigned_at).toBeTruthy();
    expect(res.body.notes).toBe('Bungkus pakai bubble wrap');
    expect(res.body.completed_at).toBeNull();
  });

  it('ticket yang langsung ditugaskan berstatus assigned, bukan unassigned', async () => {
    const token = ownerToken();
    const pengepak = await seedStaff('pengepak');

    const res = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });

    expect(res.body.status).toBe('assigned');
  });

  it('membekukan nama produk dan menandai semua item belum dipacking', async () => {
    const token = ownerToken();
    const pengepak = await seedStaff('pengepak');
    const productId = await seedProduct(token, 'Nama Saat Ticket Dibuat');

    const res = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 3 }],
    });

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product_id).toBe(productId);
    expect(res.body.items[0].product_name_snapshot).toBe('Nama Saat Ticket Dibuat');
    expect(res.body.items[0].qty).toBe(3);
    expect(res.body.items[0].is_packed).toBe(false);
    expect(res.body.items[0].id).toBeTruthy();

    // ganti nama produknya -- daftar packing yang sudah dicetak tidak ikut berubah
    await request(app)
      .patch(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nama Baru Setelah Ticket' });

    expect(res.body.items[0].product_name_snapshot).toBe('Nama Saat Ticket Dibuat');
  });

  it('tidak mengubah stok, karena stok order marketplace sudah dipotong lebih dulu', async () => {
    const token = ownerToken();
    const pengepak = await seedStaff('pengepak');
    const productId = await seedProduct(token);

    const sebelum = await request(app)
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);

    await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 5 }],
    });

    const sesudah = await request(app)
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(sesudah.body.stock_qty).toBe(sebelum.body.stock_qty);
  });

  it('menggabungkan dua baris untuk produk yang sama', async () => {
    const token = ownerToken();
    const pengepak = await seedStaff('pengepak');
    const productId = await seedProduct(token);

    const res = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [
        { product_id: productId, qty: 2 },
        { product_id: productId, qty: 3 },
      ],
    });

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].qty).toBe(5);
  });

  it('menolak penugasan ke staf yang bukan Pengepak', async () => {
    const token = ownerToken();
    const kasir = await seedStaff('kasir');

    const res = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: kasir.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/Pengepak/);
  });

  it('menolak penugasan ke akun yang tidak ada atau sudah dinonaktifkan', async () => {
    const token = ownerToken();

    const hantu = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: 'user-hantu',
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });
    expect(hantu.status).toBe(400);
    expect(hantu.body.error.message).toMatch(/tidak ditemukan|nonaktif/i);

    const pengepak = await seedStaff('pengepak');
    await authService.deactivateStaff(pengepak.id);

    const nonaktif = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });
    expect(nonaktif.status).toBe(400);
    expect(nonaktif.body.error.message).toMatch(/nonaktif|tidak ditemukan/i);
  });

  it('menolak produk yang tidak ada', async () => {
    const token = ownerToken();
    const pengepak = await seedStaff('pengepak');

    const res = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: 'produk-hantu', qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/produk-hantu/);
  });

  it('menolak order yang sudah punya ticket, supaya tidak dipacking dua kali', async () => {
    const token = ownerToken();
    const pengepak = await seedStaff('pengepak');
    const productId = await seedProduct(token);
    const orderId = randomUUID();
    const body = {
      external_order_id: orderId,
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 1 }],
    };

    expect((await createTicket(token, body)).status).toBe(201);

    const kedua = await createTicket(token, body);
    expect(kedua.status).toBe(409);
    expect(kedua.body.error.code).toBe('CONFLICT');
  });

  it('menolak body yang tidak lengkap', async () => {
    const token = ownerToken();
    const pengepak = await seedStaff('pengepak');
    const productId = await seedProduct(token);

    const tanpaOrder = await createTicket(token, {
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 1 }],
    });
    expect(tanpaOrder.status).toBe(400);

    const tanpaPenerima = await createTicket(token, {
      external_order_id: randomUUID(),
      items: [{ product_id: productId, qty: 1 }],
    });
    expect(tanpaPenerima.status).toBe(400);

    const itemKosong = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [],
    });
    expect(itemKosong.status).toBe(400);

    const qtyNol = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 0 }],
    });
    expect(qtyNol.status).toBe(400);
  });

  it('menerima ticket tanpa catatan', async () => {
    const token = ownerToken();
    const pengepak = await seedStaff('pengepak');

    const res = await createTicket(token, {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.notes).toBeNull();
  });

  it('melarang kasir & pengepak membuat ticket, dan menolak request tanpa token', async () => {
    const owner = ownerToken();
    const pengepak = await seedStaff('pengepak');
    const productId = await seedProduct(owner);
    const body = {
      external_order_id: randomUUID(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 1 }],
    };

    expect((await createTicket(staffToken('kasir'), body)).status).toBe(403);
    expect((await createTicket(staffToken('pengepak'), body)).status).toBe(403);

    const tanpaToken = await request(app).post('/api/tickets').send(body);
    expect(tanpaToken.status).toBe(401);
  });
});
