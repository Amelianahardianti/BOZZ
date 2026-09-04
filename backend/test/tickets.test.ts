// backend/test/tickets.test.ts

// Menguji POST /api/tickets: bikin ticket packing dari sebuah order
// marketplace, ditugaskan ke satu Pengepak (FR-SI-10).
//
// Modul auth-product di-mock total lewat jest.mock, sama seperti
// auth.test.ts & error-handling.test.ts. Yang diuji di sini bukan cara
// akun disimpan, tapi keputusan sales-inventory waktu menerima jawaban
// findActiveUser(): boleh/tidaknya sebuah akun dikasih ticket packing.
// Dengan begini test tidak butuh koneksi Supabase dan tidak menulis akun
// contekan ke database bersama.

import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { app } from '../src/app';
import * as repo from '../src/modules/auth-product/repository';
import type { Notification, User } from '../src/modules/auth-product/repository';
import { OWNER_ID, ownerToken, staffToken, tokenFor } from './helpers/auth';
import { bikinExternalOrder, pinjamAkun, siapkanKolamAkun } from './helpers/fixtures';
import { EVENTS, OrderStatusChangedPayload, subscribe } from '../src/shared/event-bus';

jest.mock('../src/modules/auth-product/repository');

// Baris users buat dipinjam sebagai penerima ticket. Cuma perlu ADA:
// boleh/tidaknya sebuah akun dikasih ticket tetap ditentukan mock di
// bawah, bukan isi tabel users.
beforeAll(async () => {
  await siapkanKolamAkun();
});

const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.resetAllMocks();
});

/** Akun palsu buat isi mock repo -- tidak pernah ke database beneran. */
function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: pinjamAkun(),
    name: 'Staf Uji',
    email_or_username: 'staf',
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

/** Notifikasi palsu buat balikan mock createNotification. */
function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    user_id: 'user-1',
    type: 'new_ticket',
    title: 'Ticket packing baru',
    message: null,
    reference_type: 'ticket',
    reference_id: 'ticket-1',
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Daftar akun yang "ada" selama satu test. findById dibikin mencari di
 * daftar ini, jadi id yang tidak terdaftar otomatis balik null -- persis
 * kelakuan repo aslinya waktu akunnya memang tidak ada.
 */
function mockUsers(...users: User[]): void {
  mockedRepo.findById.mockImplementation(async (id: string) => {
    return users.find((u) => u.id === id) ?? null;
  });
}

/** Pengepak aktif, tujuan penugasan yang normal. */
function seedPengepak(overrides: Partial<User> = {}): User {
  const pengepak = buildUser({
    id: pinjamAkun(),
    name: 'Pak Pengepak',
    role: 'pengepak',
    ...overrides,
  });
  mockUsers(pengepak);
  return pengepak;
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
    const pengepak = seedPengepak();
    const productId = await seedProduct(token, 'Sabun Batang');
    const orderId = await bikinExternalOrder();

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
    const pengepak = seedPengepak();

    const res = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });

    expect(res.body.status).toBe('assigned');
  });

  it('membekukan nama produk dan menandai semua item belum dipacking', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const productId = await seedProduct(token, 'Nama Saat Ticket Dibuat');

    const res = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
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
    const pengepak = seedPengepak();
    const productId = await seedProduct(token);

    const sebelum = await request(app)
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);

    await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
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
    const pengepak = seedPengepak();
    const productId = await seedProduct(token);

    const res = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
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
    const kasir = buildUser({ id: pinjamAkun(), name: 'Mbak Kasir', role: 'kasir' });
    mockUsers(kasir);

    const res = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
      assigned_to_user_id: kasir.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/Pengepak/);
  });

  it('menolak penugasan ke akun yang tidak ada', async () => {
    const token = ownerToken();
    mockUsers(); // tidak ada akun sama sekali

    const res = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
      assigned_to_user_id: 'user-hantu',
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/tidak ditemukan|nonaktif/i);
  });

  it('menolak penugasan ke akun yang sudah dinonaktifkan', async () => {
    const token = ownerToken();
    const nonaktif = seedPengepak({ is_active: false });

    const res = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
      assigned_to_user_id: nonaktif.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/nonaktif|tidak ditemukan/i);
  });

  it('menolak produk yang tidak ada', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();

    const res = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: 'produk-hantu', qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/produk-hantu/);
  });

  it('menolak order yang sudah punya ticket, supaya tidak dipacking dua kali', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const productId = await seedProduct(token);
    const orderId = await bikinExternalOrder();
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
    const pengepak = seedPengepak();
    const productId = await seedProduct(token);

    const tanpaOrder = await createTicket(token, {
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 1 }],
    });
    expect(tanpaOrder.status).toBe(400);

    const tanpaPenerima = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
      items: [{ product_id: productId, qty: 1 }],
    });
    expect(tanpaPenerima.status).toBe(400);

    const itemKosong = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
      assigned_to_user_id: pengepak.id,
      items: [],
    });
    expect(itemKosong.status).toBe(400);

    const qtyNol = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 0 }],
    });
    expect(qtyNol.status).toBe(400);
  });

  it('menerima ticket tanpa catatan', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();

    const res = await createTicket(token, {
      external_order_id: await bikinExternalOrder(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.notes).toBeNull();
  });

  it('melarang kasir & pengepak membuat ticket, dan menolak request tanpa token', async () => {
    const owner = ownerToken();
    const pengepak = seedPengepak();
    const productId = await seedProduct(owner);
    const body = {
      external_order_id: await bikinExternalOrder(),
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 1 }],
    };

    expect((await createTicket(staffToken('kasir'), body)).status).toBe(403);
    expect((await createTicket(staffToken('pengepak'), body)).status).toBe(403);

    const tanpaToken = await request(app).post('/api/tickets').send(body);
    expect(tanpaToken.status).toBe(401);
  });
});

describe('GET /api/tickets', () => {
  it('menolak request tanpa token, dan melarang kasir & pengepak', async () => {
    expect((await request(app).get('/api/tickets')).status).toBe(401);

    const kasir = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${staffToken('kasir')}`);
    expect(kasir.status).toBe(403);

    const pengepak = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`);
    expect(pengepak.status).toBe(403);
  });

  it('membalas array polos berisi ticket lengkap dengan itemnya', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const orderId = await bikinExternalOrder();

    await createTicket(token, {
      external_order_id: orderId,
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: await seedProduct(token), qty: 2 }],
    });

    const res = await request(app)
      .get('/api/tickets')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Sesuai kontrak: array polos, bukan { data, page, limit, total }.
    expect(Array.isArray(res.body)).toBe(true);

    const punyaKita = res.body.find((t: { external_order_id: string }) => t.external_order_id === orderId);
    expect(punyaKita).toBeDefined();
    expect(punyaKita.status).toBe('assigned');
    expect(punyaKita.items).toHaveLength(1);
    expect(punyaKita.items[0].qty).toBe(2);
    expect(punyaKita.items[0].is_packed).toBe(false);
  });

  it('mengurutkan dari ticket paling lama, karena ini antrean kerja', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const productId = await seedProduct(token);

    const lama = await bikinExternalOrder();
    const baru = await bikinExternalOrder();
    await createTicket(token, {
      external_order_id: lama,
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 1 }],
    });
    await createTicket(token, {
      external_order_id: baru,
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: productId, qty: 1 }],
    });

    const res = await request(app)
      .get('/api/tickets')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${token}`);

    const orders = res.body.map((t: { external_order_id: string }) => t.external_order_id);
    expect(orders.indexOf(lama)).toBeLessThan(orders.indexOf(baru));
  });

  it('memfilter berdasarkan status', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const orderId = await bikinExternalOrder();

    await createTicket(token, {
      external_order_id: orderId,
      assigned_to_user_id: pengepak.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });

    // Ticket baru selalu berstatus 'assigned'.
    const assigned = await request(app)
      .get('/api/tickets')
      .query({ status: 'assigned', limit: 100 })
      .set('Authorization', `Bearer ${token}`);
    expect(assigned.body.every((t: { status: string }) => t.status === 'assigned')).toBe(true);
    expect(
      assigned.body.some((t: { external_order_id: string }) => t.external_order_id === orderId)
    ).toBe(true);

    // Belum ada endpoint pengubah status, jadi status lain pasti kosong.
    const handedOver = await request(app)
      .get('/api/tickets')
      .query({ status: 'handed_over', limit: 100 })
      .set('Authorization', `Bearer ${token}`);
    expect(handedOver.body).toEqual([]);
  });

  it('memotong hasil per halaman', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const productId = await seedProduct(token);

    for (let i = 0; i < 2; i += 1) {
      await createTicket(token, {
        external_order_id: await bikinExternalOrder(),
        assigned_to_user_id: pengepak.id,
        items: [{ product_id: productId, qty: 1 }],
      });
    }

    const halaman1 = await request(app)
      .get('/api/tickets')
      .query({ page: 1, limit: 1 })
      .set('Authorization', `Bearer ${token}`);
    const halaman2 = await request(app)
      .get('/api/tickets')
      .query({ page: 2, limit: 1 })
      .set('Authorization', `Bearer ${token}`);

    expect(halaman1.body).toHaveLength(1);
    expect(halaman2.body).toHaveLength(1);
    expect(halaman1.body[0].id).not.toBe(halaman2.body[0].id);
  });

  it('menolak status di luar daftar dan limit di luar 1..100', async () => {
    const token = ownerToken();

    const statusSalah = await request(app)
      .get('/api/tickets')
      .query({ status: 'selesai' })
      .set('Authorization', `Bearer ${token}`);
    expect(statusSalah.status).toBe(400);
    expect(statusSalah.body.error.code).toBe('VALIDATION_ERROR');

    const limitSalah = await request(app)
      .get('/api/tickets')
      .query({ limit: 101 })
      .set('Authorization', `Bearer ${token}`);
    expect(limitSalah.status).toBe(400);
  });
});

describe('GET /api/tickets/my', () => {
  it('menolak request tanpa token, dan melarang owner & kasir', async () => {
    expect((await request(app).get('/api/tickets/my')).status).toBe(401);

    const owner = await request(app)
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${ownerToken()}`);
    expect(owner.status).toBe(403);

    const kasir = await request(app)
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${staffToken('kasir')}`);
    expect(kasir.status).toBe(403);
  });

  it('hanya membalas ticket milik pengepak yang sedang login', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token);

    const saya = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const oranglain = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    mockUsers(saya, oranglain);

    const orderSaya = await bikinExternalOrder();
    const orderOrangLain = await bikinExternalOrder();
    await createTicket(token, {
      external_order_id: orderSaya,
      assigned_to_user_id: saya.id,
      items: [{ product_id: productId, qty: 1 }],
    });
    await createTicket(token, {
      external_order_id: orderOrangLain,
      assigned_to_user_id: oranglain.id,
      items: [{ product_id: productId, qty: 1 }],
    });

    const res = await request(app)
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${tokenFor('pengepak', saya.id)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((t: { assigned_to_user_id: string }) => t.assigned_to_user_id === saya.id)).toBe(
      true
    );

    const orders = res.body.map((t: { external_order_id: string }) => t.external_order_id);
    expect(orders).toContain(orderSaya);
    expect(orders).not.toContain(orderOrangLain);
  });

  it('penerima diambil dari token, tidak bisa diintip lewat query', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token);

    const saya = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const oranglain = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    mockUsers(saya, oranglain);

    const orderOrangLain = await bikinExternalOrder();
    await createTicket(token, {
      external_order_id: orderOrangLain,
      assigned_to_user_id: oranglain.id,
      items: [{ product_id: productId, qty: 1 }],
    });

    // Coba paksa lewat query -- harus diabaikan total.
    const res = await request(app)
      .get('/api/tickets/my')
      .query({ assigned_to_user_id: oranglain.id, user_id: oranglain.id })
      .set('Authorization', `Bearer ${tokenFor('pengepak', saya.id)}`);

    expect(res.status).toBe(200);
    const orders = res.body.map((t: { external_order_id: string }) => t.external_order_id);
    expect(orders).not.toContain(orderOrangLain);
  });

  it('membalas array kosong kalau belum dapat ticket sama sekali', async () => {
    const res = await request(app)
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${tokenFor('pengepak', pinjamAkun())}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('mengurutkan dari ticket paling lama', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token);
    const saya = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    mockUsers(saya);

    const lama = await bikinExternalOrder();
    const baru = await bikinExternalOrder();
    await createTicket(token, {
      external_order_id: lama,
      assigned_to_user_id: saya.id,
      items: [{ product_id: productId, qty: 1 }],
    });
    await createTicket(token, {
      external_order_id: baru,
      assigned_to_user_id: saya.id,
      items: [{ product_id: productId, qty: 1 }],
    });

    const res = await request(app)
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${tokenFor('pengepak', saya.id)}`);

    const orders = res.body.map((t: { external_order_id: string }) => t.external_order_id);
    expect(orders).toEqual([lama, baru]);
  });
});

describe('PATCH /api/tickets/:id/assign', () => {
  /** Bikin satu ticket yang sudah dipegang `pemilikAwal`. */
  async function seedTicket(token: string, pemilikAwal: User): Promise<{ id: string; order: string }> {
    const order = await bikinExternalOrder();
    const res = await createTicket(token, {
      external_order_id: order,
      assigned_to_user_id: pemilikAwal.id,
      items: [{ product_id: await seedProduct(token), qty: 1 }],
    });
    expect(res.status).toBe(201);
    return { id: res.body.id, order };
  }

  function assign(token: string, ticketId: string, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('memindahkan ticket ke pengepak lain', async () => {
    const token = ownerToken();
    const lama = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const baru = buildUser({
      id: pinjamAkun(),
      name: 'Pengepak Pengganti',
      role: 'pengepak',
    });
    mockUsers(lama, baru);
    const ticket = await seedTicket(token, lama);

    const res = await assign(token, ticket.id, { assigned_to_user_id: baru.id });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticket.id);
    expect(res.body.assigned_to_user_id).toBe(baru.id);
    expect(res.body.assigned_by).toBe(OWNER_ID);
    expect(res.body.status).toBe('assigned');
    expect(res.body.assigned_at).toBeTruthy();
    // isi ticket tidak ikut berubah
    expect(res.body.external_order_id).toBe(ticket.order);
    expect(res.body.items).toHaveLength(1);
  });

  it('membuat notifikasi untuk pengepak yang baru ditugaskan', async () => {
    const token = ownerToken();
    const lama = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const baru = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    mockUsers(lama, baru);
    const ticket = await seedTicket(token, lama);

    mockedRepo.createNotification.mockResolvedValue(buildNotification());

    await assign(token, ticket.id, { assigned_to_user_id: baru.id });

    expect(mockedRepo.createNotification).toHaveBeenCalledTimes(1);
    const dikirim = mockedRepo.createNotification.mock.calls[0][0];
    expect(dikirim.user_id).toBe(baru.id);
    expect(dikirim.type).toBe('new_ticket');
    expect(dikirim.reference_type).toBe('ticket');
    expect(dikirim.reference_id).toBe(ticket.id);
    expect(dikirim.title).toBeTruthy();
    expect(dikirim.message).toContain(ticket.order);
  });

  it('notifikasinya ditujukan ke penerima baru, bukan ke pengepak lama', async () => {
    const token = ownerToken();
    const lama = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const baru = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    mockUsers(lama, baru);
    const ticket = await seedTicket(token, lama);

    mockedRepo.createNotification.mockResolvedValue(buildNotification());
    await assign(token, ticket.id, { assigned_to_user_id: baru.id });

    expect(mockedRepo.createNotification.mock.calls[0][0].user_id).toBe(baru.id);
    expect(mockedRepo.createNotification.mock.calls[0][0].user_id).not.toBe(lama.id);
  });

  it('ticket pindah ke antrean pengepak baru, hilang dari antrean yang lama', async () => {
    const token = ownerToken();
    const lama = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const baru = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    mockUsers(lama, baru);
    const ticket = await seedTicket(token, lama);

    await assign(token, ticket.id, { assigned_to_user_id: baru.id });

    const antreanLama = await request(app)
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${tokenFor('pengepak', lama.id)}`);
    expect(antreanLama.body.map((t: { id: string }) => t.id)).not.toContain(ticket.id);

    const antreanBaru = await request(app)
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${tokenFor('pengepak', baru.id)}`);
    expect(antreanBaru.body.map((t: { id: string }) => t.id)).toContain(ticket.id);
  });

  it('penugasan tetap berhasil walau pembuatan notifikasi gagal', async () => {
    const token = ownerToken();
    const lama = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const baru = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    mockUsers(lama, baru);
    const ticket = await seedTicket(token, lama);

    mockedRepo.createNotification.mockRejectedValue(new Error('database notifikasi mati'));
    const diamkanLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const res = await assign(token, ticket.id, { assigned_to_user_id: baru.id });

      // Ticket-nya sudah benar-benar berpindah, jadi jangan balas error --
      // Owner bisa mengira penugasannya batal lalu mengulang.
      expect(res.status).toBe(200);
      expect(res.body.assigned_to_user_id).toBe(baru.id);
      expect(diamkanLog).toHaveBeenCalled();
    } finally {
      diamkanLog.mockRestore();
    }
  });

  it('menolak penugasan ke staf yang bukan Pengepak', async () => {
    const token = ownerToken();
    const pengepak = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const kasir = buildUser({ id: pinjamAkun(), name: 'Mbak Kasir', role: 'kasir' });
    mockUsers(pengepak, kasir);
    const ticket = await seedTicket(token, pengepak);

    const res = await assign(token, ticket.id, { assigned_to_user_id: kasir.id });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Pengepak/);
    expect(mockedRepo.createNotification).not.toHaveBeenCalled();
  });

  it('menolak penugasan ke akun tidak dikenal atau yang sudah nonaktif', async () => {
    const token = ownerToken();
    const pengepak = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const nonaktif = buildUser({
      id: pinjamAkun(),
      role: 'pengepak',
      is_active: false,
    });
    mockUsers(pengepak, nonaktif);
    const ticket = await seedTicket(token, pengepak);

    const hantu = await assign(token, ticket.id, { assigned_to_user_id: 'user-hantu' });
    expect(hantu.status).toBe(400);

    const mati = await assign(token, ticket.id, { assigned_to_user_id: nonaktif.id });
    expect(mati.status).toBe(400);

    // penerima aslinya tidak berubah
    const tetap = await request(app)
      .get('/api/tickets/my')
      .set('Authorization', `Bearer ${tokenFor('pengepak', pengepak.id)}`);
    expect(tetap.body.map((t: { id: string }) => t.id)).toContain(ticket.id);
  });

  it('membalas 404 kalau ticketnya tidak ada', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();

    const res = await assign(token, 'ticket-hantu', { assigned_to_user_id: pengepak.id });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('menolak body tanpa assigned_to_user_id', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket(token, pengepak);

    const res = await assign(token, ticket.id, {});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('melarang kasir & pengepak, dan menolak request tanpa token', async () => {
    const owner = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket(owner, pengepak);
    const body = { assigned_to_user_id: pengepak.id };

    expect((await assign(staffToken('kasir'), ticket.id, body)).status).toBe(403);
    expect((await assign(staffToken('pengepak'), ticket.id, body)).status).toBe(403);

    const tanpaToken = await request(app)
      .patch(`/api/tickets/${ticket.id}/assign`)
      .send(body);
    expect(tanpaToken.status).toBe(401);
  });
});

describe('PATCH /api/tickets/:id/status', () => {
  /** Ticket dengan 2 item, dipegang `pemilik`. */
  async function seedTicket2Item(
    token: string,
    pemilik: User
  ): Promise<{ id: string; order: string; items: { id: string }[] }> {
    const order = await bikinExternalOrder();
    const res = await createTicket(token, {
      external_order_id: order,
      assigned_to_user_id: pemilik.id,
      items: [
        { product_id: await seedProduct(token), qty: 1 },
        { product_id: await seedProduct(token), qty: 2 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    return { id: res.body.id, order, items: res.body.items };
  }

  function ubahStatus(token: string, ticketId: string, body: Record<string, unknown>) {
    return request(app)
      .patch(`/api/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  /** Tangkap event order.status.changed selama satu aksi. */
  async function tangkapEvent<T>(aksi: () => Promise<T>): Promise<OrderStatusChangedPayload[]> {
    const diterima: OrderStatusChangedPayload[] = [];
    const berhenti = subscribe(EVENTS.ORDER_STATUS_CHANGED, (payload) => {
      diterima.push(payload);
    });
    try {
      await aksi();
    } finally {
      berhenti();
    }
    return diterima;
  }

  it('mengubah status ticket', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    const res = await ubahStatus(token, ticket.id, { status: 'packing' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('packing');
    expect(res.body.completed_at).toBeNull();
  });

  it('mencentang sebagian item tanpa menyentuh yang lain', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    const res = await ubahStatus(token, ticket.id, {
      ticket_items: [{ id: ticket.items[0].id, is_packed: true }],
    });

    expect(res.status).toBe(200);
    expect(res.body.items.find((i: { id: string }) => i.id === ticket.items[0].id).is_packed).toBe(
      true
    );
    expect(res.body.items.find((i: { id: string }) => i.id === ticket.items[1].id).is_packed).toBe(
      false
    );
  });

  it('bisa mencentang dan mengganti status sekaligus', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    const res = await ubahStatus(token, ticket.id, {
      status: 'packing',
      ticket_items: [{ id: ticket.items[0].id, is_packed: true }],
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('packing');
    expect(res.body.items.find((i: { id: string }) => i.id === ticket.items[0].id).is_packed).toBe(
      true
    );
  });

  it('centang bisa dibatalkan lagi (is_packed false)', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    await ubahStatus(token, ticket.id, {
      ticket_items: [{ id: ticket.items[0].id, is_packed: true }],
    });
    const res = await ubahStatus(token, ticket.id, {
      ticket_items: [{ id: ticket.items[0].id, is_packed: false }],
    });

    expect(res.body.items.find((i: { id: string }) => i.id === ticket.items[0].id).is_packed).toBe(
      false
    );
  });

  it('TIDAK mengirim event selama masih ada item yang belum dicentang', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    const events = await tangkapEvent(() =>
      ubahStatus(token, ticket.id, {
        status: 'packing',
        ticket_items: [{ id: ticket.items[0].id, is_packed: true }],
      })
    );

    expect(events.filter((e) => e.external_order_id === ticket.order)).toHaveLength(0);
  });

  it('mengirim order.status.changed begitu centang terakhir masuk', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    await ubahStatus(token, ticket.id, {
      ticket_items: [{ id: ticket.items[0].id, is_packed: true }],
    });

    const events = await tangkapEvent(() =>
      ubahStatus(token, ticket.id, {
        ticket_items: [{ id: ticket.items[1].id, is_packed: true }],
      })
    );

    const punyaKita = events.filter((e) => e.external_order_id === ticket.order);
    expect(punyaKita).toHaveLength(1);
    expect(punyaKita[0].new_status).toBe('processing');
    expect(punyaKita[0].occurred_at).toBeTruthy();
  });

  it('tidak mengirim event yang sama berulang kali', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    await ubahStatus(token, ticket.id, {
      ticket_items: [
        { id: ticket.items[0].id, is_packed: true },
        { id: ticket.items[1].id, is_packed: true },
      ],
    });

    // sudah lengkap sejak request sebelumnya -- request berikutnya tidak
    // boleh mengabari marketplace lagi
    const events = await tangkapEvent(() => ubahStatus(token, ticket.id, { status: 'packed' }));

    expect(events.filter((e) => e.external_order_id === ticket.order)).toHaveLength(0);
  });

  it('mengisi completed_at saat ticket diserahkan, dan mengunci perubahan berikutnya', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    const selesai = await ubahStatus(token, ticket.id, { status: 'handed_over' });
    expect(selesai.status).toBe(200);
    expect(selesai.body.status).toBe('handed_over');
    expect(selesai.body.completed_at).toBeTruthy();

    const lagi = await ubahStatus(token, ticket.id, { status: 'packing' });
    expect(lagi.status).toBe(409);
    expect(lagi.body.error.code).toBe('CONFLICT');
  });

  it('pengepak boleh mengerjakan ticketnya sendiri', async () => {
    const owner = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(owner, pengepak);

    const res = await ubahStatus(tokenFor('pengepak', pengepak.id), ticket.id, {
      status: 'packing',
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('packing');
  });

  it('pengepak TIDAK boleh menyentuh ticket pengepak lain', async () => {
    const owner = ownerToken();
    const pemilik = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    const penyusup = buildUser({ id: pinjamAkun(), role: 'pengepak' });
    mockUsers(pemilik, penyusup);
    const ticket = await seedTicket2Item(owner, pemilik);

    const res = await ubahStatus(tokenFor('pengepak', penyusup.id), ticket.id, {
      ticket_items: [
        { id: ticket.items[0].id, is_packed: true },
        { id: ticket.items[1].id, is_packed: true },
      ],
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');

    // centangnya benar-benar tidak tersimpan
    const cek = await request(app)
      .get('/api/tickets')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${owner}`);
    const masih = cek.body.find((t: { id: string }) => t.id === ticket.id);
    expect(masih.items.every((i: { is_packed: boolean }) => !i.is_packed)).toBe(true);
  });

  it('menolak id item yang bukan milik ticket ini, tanpa menyimpan centang lain', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    const res = await ubahStatus(token, ticket.id, {
      ticket_items: [
        { id: ticket.items[0].id, is_packed: true },
        { id: 'item-hantu', is_packed: true },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/item-hantu/);

    // semua atau tidak sama sekali -- item pertama tidak boleh terlanjur tercentang
    const cek = await request(app)
      .get('/api/tickets')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${token}`);
    const masih = cek.body.find((t: { id: string }) => t.id === ticket.id);
    expect(masih.items.every((i: { is_packed: boolean }) => !i.is_packed)).toBe(true);
  });

  it('menolak body kosong, status di luar daftar, dan is_packed bukan boolean', async () => {
    const token = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(token, pengepak);

    expect((await ubahStatus(token, ticket.id, {})).status).toBe(400);
    expect((await ubahStatus(token, ticket.id, { status: 'selesai' })).status).toBe(400);
    expect(
      (
        await ubahStatus(token, ticket.id, {
          ticket_items: [{ id: ticket.items[0].id, is_packed: 'ya' }],
        })
      ).status
    ).toBe(400);
  });

  it('membalas 404 kalau ticketnya tidak ada', async () => {
    const res = await ubahStatus(ownerToken(), 'ticket-hantu', { status: 'packing' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('melarang kasir, dan menolak request tanpa token', async () => {
    const owner = ownerToken();
    const pengepak = seedPengepak();
    const ticket = await seedTicket2Item(owner, pengepak);

    expect((await ubahStatus(staffToken('kasir'), ticket.id, { status: 'packing' })).status).toBe(
      403
    );

    const tanpaToken = await request(app)
      .patch(`/api/tickets/${ticket.id}/status`)
      .send({ status: 'packing' });
    expect(tanpaToken.status).toBe(401);
  });
});
