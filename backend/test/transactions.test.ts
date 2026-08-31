// backend/test/transactions.test.ts

// Menguji POST /api/transactions sesuai contracts/api.yaml + SRS 9.1-9.3:
// idempotency, hitung kembalian, potong stok, dan stok kurang -> 409.

import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { OWNER_ID, ownerToken, staffToken } from './helpers/auth';
import { EVENTS, StockUpdatedPayload, subscribe } from '../src/shared/event-bus';
import { describe, expect, it, jest } from '@jest/globals';

/** Bikin produk khusus buat satu test, biar test tidak saling ganggu. */
async function seedProduct(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; price: number; stock_qty: number }> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Produk TX ${randomUUID()}`, price: 10000, stock_qty: 10, ...overrides });
  expect(res.status).toBe(201);
  return res.body;
}

async function stockOf(token: string, productId: string): Promise<number> {
  const res = await request(app)
    .get(`/api/products/${productId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.stock_qty as number;
}

function checkout(token: string, key: string, body: Record<string, unknown>) {
  return request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send(body);
}

describe('POST /api/transactions — dasar', () => {
  it('menolak request tanpa token', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Idempotency-Key', randomUUID())
      .send({ type: 'walk_in', payment_method: 'transfer', items: [] });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('melarang pengepak melakukan checkout', async () => {
    const token = staffToken('pengepak');
    const owner = ownerToken();
    const produk = await seedProduct(owner);

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 1 }],
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('mencatat transaksi lengkap dengan snapshot nama & harga produk', async () => {
    const owner = ownerToken();
    const kasir = staffToken('kasir');
    const produk = await seedProduct(owner, { name: 'Produk Snapshot', price: 12500, stock_qty: 4 });

    const res = await checkout(kasir, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 2 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('completed');
    expect(res.body.type).toBe('walk_in');
    expect(res.body.subtotal).toBe(25000);
    expect(res.body.total_amount).toBe(25000);
    expect(res.body.cashier_user_id).toBeTruthy();
    expect(res.body.customer_id).toBeNull();
    expect(res.body.synced_offline).toBe(false);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product_name_snapshot).toBe('Produk Snapshot');
    expect(res.body.items[0].unit_price).toBe(12500);
    expect(res.body.items[0].subtotal).toBe(25000);

    // sidik jari internal tidak boleh ikut bocor ke frontend
    expect(res.body.request_fingerprint).toBeUndefined();

    // harga di struk tidak ikut berubah walau harga produknya diubah
    await request(app)
      .patch(`/api/products/${produk.id}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ price: 99000, name: 'Nama Sudah Diganti' });
    const ulang = await checkout(kasir, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 1 }],
    });
    expect(ulang.body.items[0].unit_price).toBe(99000);
    expect(res.body.items[0].unit_price).toBe(12500);
  });

  it('menerima tipe pre_order', async () => {
    const owner = ownerToken();
    const produk = await seedProduct(owner);

    const res = await checkout(owner, randomUUID(), {
      type: 'pre_order',
      payment_method: 'ewallet',
      items: [{ product_id: produk.id, qty: 1 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('pre_order');
  });

  it('menolak type & payment_method di luar daftar, serta keranjang kosong', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token);
    const item = [{ product_id: produk.id, qty: 1 }];

    const tipeSalah = await checkout(token, randomUUID(), {
      type: 'dine_in',
      payment_method: 'cash',
      amount_paid: 10000,
      items: item,
    });
    expect(tipeSalah.status).toBe(400);

    const bayarSalah = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'qris',
      items: item,
    });
    expect(bayarSalah.status).toBe(400);

    const kosong = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [],
    });
    expect(kosong.status).toBe(400);
    expect(kosong.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('menolak qty nol/minus/pecahan', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token);

    for (const qty of [0, -1, 1.5]) {
      const res = await checkout(token, randomUUID(), {
        type: 'walk_in',
        payment_method: 'transfer',
        items: [{ product_id: produk.id, qty }],
      });
      expect(res.status).toBe(400);
    }
  });

  it('menolak produk yang tidak ada atau sudah tidak aktif', async () => {
    const token = ownerToken();

    const hantu = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: 'produk-hantu', qty: 1 }],
    });
    expect(hantu.status).toBe(400);

    const produk = await seedProduct(token);
    await request(app)
      .patch(`/api/products/${produk.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });

    const nonaktif = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 1 }],
    });
    expect(nonaktif.status).toBe(400);
    expect(nonaktif.body.error.message).toMatch(/tidak aktif/i);
  });
});

describe('POST /api/transactions — Idempotency-Key', () => {
  it('menolak request tanpa header Idempotency-Key', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token);

    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'walk_in',
        payment_method: 'transfer',
        items: [{ product_id: produk.id, qty: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/Idempotency-Key/i);
  });

  it('menolak Idempotency-Key yang bukan UUID', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token);

    const res = await checkout(token, 'bukan-uuid', {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/UUID/i);
  });

  it('request yang sama diulang mengembalikan transaksi yang sama, stok cuma kepotong sekali', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { stock_qty: 10 });
    const key = randomUUID();
    const body = {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 3 }],
    };

    const pertama = await checkout(token, key, body);
    const kedua = await checkout(token, key, body);

    expect(pertama.status).toBe(201);
    expect(kedua.status).toBe(201);
    expect(kedua.body.id).toBe(pertama.body.id);
    expect(kedua.body.created_at).toBe(pertama.body.created_at);
    expect(await stockOf(token, produk.id)).toBe(7);
  });

  it('menganggap sama walau urutan item di keranjang berbeda', async () => {
    const token = ownerToken();
    const a = await seedProduct(token, { stock_qty: 10 });
    const b = await seedProduct(token, { stock_qty: 10 });
    const key = randomUUID();

    const pertama = await checkout(token, key, {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [
        { product_id: a.id, qty: 1 },
        { product_id: b.id, qty: 2 },
      ],
    });
    const kedua = await checkout(token, key, {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [
        { product_id: b.id, qty: 2 },
        { product_id: a.id, qty: 1 },
      ],
    });

    expect(kedua.body.id).toBe(pertama.body.id);
    expect(await stockOf(token, a.id)).toBe(9);
  });

  it('menolak key yang sama dipakai untuk isi transaksi yang berbeda', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { stock_qty: 10 });
    const key = randomUUID();

    await checkout(token, key, {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 1 }],
    });
    const beda = await checkout(token, key, {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 5 }],
    });

    expect(beda.status).toBe(409);
    expect(beda.body.error.code).toBe('CONFLICT');
    expect(await stockOf(token, produk.id)).toBe(9);
  });

  it('dua request kembar yang dikirim bersamaan tetap jadi satu transaksi', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { stock_qty: 10 });
    const key = randomUUID();
    const body = {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 2 }],
    };

    const [a, b] = await Promise.all([checkout(token, key, body), checkout(token, key, body)]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id);
    expect(await stockOf(token, produk.id)).toBe(8);
  });
});

describe('POST /api/transactions — pembayaran & kembalian', () => {
  it('menghitung kembalian untuk pembayaran tunai', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { price: 12500, stock_qty: 5 });

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'cash',
      amount_paid: 50000,
      items: [{ product_id: produk.id, qty: 2 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.total_amount).toBe(25000);
    expect(res.body.amount_paid).toBe(50000);
    expect(res.body.change_amount).toBe(25000);
  });

  it('kembalian 0 kalau uangnya pas', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { price: 7500, stock_qty: 5 });

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'cash',
      amount_paid: 7500,
      items: [{ product_id: produk.id, qty: 1 }],
    });

    expect(res.body.change_amount).toBe(0);
  });

  it('menghitung kembalian dengan pecahan sen tanpa meleset', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { price: 0.1, stock_qty: 10 });

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'cash',
      amount_paid: 1,
      items: [{ product_id: produk.id, qty: 3 }],
    });

    expect(res.body.total_amount).toBe(0.3);
    expect(res.body.change_amount).toBe(0.7);
  });

  it('menolak pembayaran tunai tanpa amount_paid', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token);

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'cash',
      items: [{ product_id: produk.id, qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/amount_paid/);
  });

  it('menolak kalau uang yang dibayarkan kurang dari total', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { price: 10000, stock_qty: 5 });

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'cash',
      amount_paid: 9000,
      items: [{ product_id: produk.id, qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/kurang/i);
    expect(await stockOf(token, produk.id)).toBe(5); // stok tidak kepotong
  });

  it('transfer & e-wallet: amount_paid dan change_amount null', async () => {
    const token = ownerToken();

    for (const metode of ['transfer', 'ewallet']) {
      const produk = await seedProduct(token, { price: 8000, stock_qty: 3 });
      const res = await checkout(token, randomUUID(), {
        type: 'walk_in',
        payment_method: metode,
        items: [{ product_id: produk.id, qty: 1 }],
      });

      expect(res.status).toBe(201);
      expect(res.body.payment_method).toBe(metode);
      expect(res.body.amount_paid).toBeNull();
      expect(res.body.change_amount).toBeNull();
    }
  });

  it('menolak amount_paid untuk metode non-tunai', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token);

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      amount_paid: 10000,
      items: [{ product_id: produk.id, qty: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/tunai/i);
  });
});

describe('POST /api/transactions — stok', () => {
  it('memotong stok setiap produk sesuai qty', async () => {
    const token = ownerToken();
    const a = await seedProduct(token, { stock_qty: 10 });
    const b = await seedProduct(token, { stock_qty: 4 });

    await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [
        { product_id: a.id, qty: 3 },
        { product_id: b.id, qty: 4 },
      ],
    });

    expect(await stockOf(token, a.id)).toBe(7);
    expect(await stockOf(token, b.id)).toBe(0);
  });

  it('membalas 409 kalau stok tidak cukup, tanpa mengubah stok apa pun', async () => {
    const token = ownerToken();
    const cukup = await seedProduct(token, { stock_qty: 10 });
    const kurang = await seedProduct(token, { stock_qty: 1 });

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [
        { product_id: cukup.id, qty: 2 },
        { product_id: kurang.id, qty: 5 },
      ],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/tinggal 1/);

    // Yang stoknya cukup pun tidak boleh ikut kepotong -- semua atau
    // tidak sama sekali (SRS 9.1).
    expect(await stockOf(token, cukup.id)).toBe(10);
    expect(await stockOf(token, kurang.id)).toBe(1);
  });

  it('menjumlahkan qty produk yang sama walau dikirim sebagai dua baris', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { price: 1000, stock_qty: 5 });

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [
        { product_id: produk.id, qty: 2 },
        { product_id: produk.id, qty: 3 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].qty).toBe(5);
    expect(res.body.total_amount).toBe(5000);
    expect(await stockOf(token, produk.id)).toBe(0);
  });

  it('menolak kalau total qty gabungan melebihi stok', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { stock_qty: 4 });

    const res = await checkout(token, randomUUID(), {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [
        { product_id: produk.id, qty: 3 },
        { product_id: produk.id, qty: 3 },
      ],
    });

    expect(res.status).toBe(409);
    expect(await stockOf(token, produk.id)).toBe(4);
  });

  it('dua checkout barengan untuk barang terakhir: satu sukses, satu 409', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { stock_qty: 1 });
    const body = {
      type: 'walk_in',
      payment_method: 'transfer',
      items: [{ product_id: produk.id, qty: 1 }],
    };

    const hasil = await Promise.all([
      checkout(token, randomUUID(), body),
      checkout(token, randomUUID(), body),
    ]);

    const status = hasil.map((r) => r.status).sort();
    expect(status).toEqual([201, 409]);
    expect(await stockOf(token, produk.id)).toBe(0); // tidak pernah minus
  });

  it('mempublikasikan event stock.updated untuk tiap produk yang terjual', async () => {
    const token = ownerToken();
    const produk = await seedProduct(token, { stock_qty: 6 });

    const diterima: StockUpdatedPayload[] = [];
    const berhenti = subscribe(EVENTS.STOCK_UPDATED, (payload) => {
      diterima.push(payload);
    });

    try {
      await checkout(token, randomUUID(), {
        type: 'walk_in',
        payment_method: 'transfer',
        items: [{ product_id: produk.id, qty: 2 }],
      });
    } finally {
      berhenti();
    }

    const milikKita = diterima.filter((p) => p.product_id === produk.id);
    expect(milikKita).toHaveLength(1);
    expect(milikKita[0].change_qty).toBe(-2);
    expect(milikKita[0].stock_after).toBe(4);
    expect(milikKita[0].reason).toBe('sale');
    expect(milikKita[0].occurred_at).toBeTruthy();
  });
});
