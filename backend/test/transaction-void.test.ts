// backend/test/transaction-void.test.ts

// Menguji PATCH /api/transactions/:id/void: transaksi dibatalkan dan
// stoknya otomatis kembali (FR-FI-07, SRS 9.1).

import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import * as repo from '../src/modules/sales-inventory/repository';
import { OWNER_ID, kasirToken, ownerToken } from './helpers/auth';
import { EVENTS, StockUpdatedPayload, subscribe } from '../src/shared/event-bus';
import { describe, expect, it, jest } from '@jest/globals';

async function seedProduct(token: string, stockQty = 20, price = 10000): Promise<string> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Produk Void ${randomUUID()}`, price, stock_qty: stockQty });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function stockOf(token: string, productId: string): Promise<number> {
  const res = await request(app)
    .get(`/api/products/${productId}`)
    .set('Authorization', `Bearer ${token}`);
  return res.body.stock_qty as number;
}

async function checkout(
  token: string,
  items: { product_id: string; qty: number }[]
): Promise<{ id: string }> {
  const res = await request(app)
    .post('/api/transactions')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', randomUUID())
    .send({ type: 'walk_in', payment_method: 'transfer', items });
  expect(res.status).toBe(201);
  return res.body;
}

function voidTransaction(token: string, id: string, body?: Record<string, unknown>) {
  const req = request(app)
    .patch(`/api/transactions/${id}/void`)
    .set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

describe('PATCH /api/transactions/:id/void', () => {
  it('membatalkan transaksi dan mencatat siapa, kapan, dan alasannya', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 10);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 2 }]);

    const res = await voidTransaction(token, transaksi.id, { void_reason: 'Salah input barang' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(transaksi.id);
    expect(res.body.status).toBe('voided');
    expect(res.body.voided_by).toBe(OWNER_ID);
    expect(res.body.void_reason).toBe('Salah input barang');
    expect(res.body.voided_at).toBeTruthy();
    expect(res.body.request_fingerprint).toBeUndefined();
    // isi transaksinya tidak dihapus -- struk lama tetap bisa dibaca
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total_amount).toBe(20000);
  });

  it('mengembalikan stok setiap item ke jumlah semula', async () => {
    const token = ownerToken();
    const a = await seedProduct(token, 10);
    const b = await seedProduct(token, 5);

    const transaksi = await checkout(token, [
      { product_id: a, qty: 3 },
      { product_id: b, qty: 5 },
    ]);
    expect(await stockOf(token, a)).toBe(7);
    expect(await stockOf(token, b)).toBe(0);

    await voidTransaction(token, transaksi.id);

    expect(await stockOf(token, a)).toBe(10);
    expect(await stockOf(token, b)).toBe(5);
  });

  it('mencatat pengembalian stok di log dengan reason void_reversal', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 8);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 3 }]);

    await voidTransaction(token, transaksi.id);

    const log = await repo.listStockAdjustmentsByProduct(productId);
    expect(log).toHaveLength(2);

    const [penjualan, pembatalan] = log;
    expect(penjualan.reason).toBe('sale');
    expect(penjualan.change_qty).toBe(-3);
    expect(penjualan.stock_after).toBe(5);

    expect(pembatalan.reason).toBe('void_reversal');
    expect(pembatalan.change_qty).toBe(3);
    expect(pembatalan.stock_before).toBe(5);
    expect(pembatalan.stock_after).toBe(8);
    expect(pembatalan.reference_type).toBe('transaction');
    expect(pembatalan.reference_id).toBe(transaksi.id);
    expect(pembatalan.adjusted_by_user_id).toBe(OWNER_ID);
  });

  it('mempublikasikan stock.updated untuk tiap item yang stoknya kembali', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 6);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 2 }]);

    const diterima: StockUpdatedPayload[] = [];
    const berhenti = subscribe(EVENTS.STOCK_UPDATED, (payload) => {
      diterima.push(payload);
    });

    try {
      await voidTransaction(token, transaksi.id);
    } finally {
      berhenti();
    }

    const milikKita = diterima.filter((p) => p.product_id === productId);
    expect(milikKita).toHaveLength(1);
    expect(milikKita[0].change_qty).toBe(2);
    expect(milikKita[0].stock_after).toBe(6);
    expect(milikKita[0].reason).toBe('void_reversal');
  });

  it('menerima request tanpa body, void_reason jadi null', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 5);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 1 }]);

    const res = await voidTransaction(token, transaksi.id);

    expect(res.status).toBe(200);
    expect(res.body.void_reason).toBeNull();
  });

  it('menganggap alasan berisi spasi saja sama dengan tidak diisi', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 5);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 1 }]);

    const res = await voidTransaction(token, transaksi.id, { void_reason: '   ' });

    expect(res.status).toBe(200);
    expect(res.body.void_reason).toBeNull();
  });

  it('menolak pembatalan kedua, stok tidak dikembalikan dua kali', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 10);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 4 }]);

    const pertama = await voidTransaction(token, transaksi.id);
    expect(pertama.status).toBe(200);
    expect(await stockOf(token, productId)).toBe(10);

    const kedua = await voidTransaction(token, transaksi.id);
    expect(kedua.status).toBe(409);
    expect(kedua.body.error.code).toBe('CONFLICT');
    expect(await stockOf(token, productId)).toBe(10);
    expect(await repo.listStockAdjustmentsByProduct(productId)).toHaveLength(2);
  });

  it('dua pembatalan yang dikirim bersamaan: satu berhasil, satu 409', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 10);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 2 }]);

    const hasil = await Promise.all([
      voidTransaction(token, transaksi.id),
      voidTransaction(token, transaksi.id),
    ]);

    expect(hasil.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stockOf(token, productId)).toBe(10);
  });

  it('membalas 404 kalau transaksinya tidak ada', async () => {
    const token = ownerToken();

    const res = await voidTransaction(token, 'transaksi-hantu', { void_reason: 'apa saja' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('menolak void_reason yang kepanjangan', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 5);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 1 }]);

    const res = await voidTransaction(token, transaksi.id, { void_reason: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await stockOf(token, productId)).toBe(4); // belum dibatalkan
  });

  it('melarang kasir membatalkan transaksi, dan menolak request tanpa token', async () => {
    const owner = ownerToken();
    const productId = await seedProduct(owner, 5);
    const transaksi = await checkout(owner, [{ product_id: productId, qty: 1 }]);

    const kasir = await voidTransaction(kasirToken(), transaksi.id);
    expect(kasir.status).toBe(403);
    expect(kasir.body.error.code).toBe('FORBIDDEN');

    const tanpaToken = await request(app).patch(`/api/transactions/${transaksi.id}/void`).send();
    expect(tanpaToken.status).toBe(401);

    expect(await stockOf(owner, productId)).toBe(4); // tidak jadi dibatalkan
  });

  it('transaksi yang dibatalkan tetap muncul di laporan dengan status voided', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 5);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 1 }]);
    await voidTransaction(token, transaksi.id, { void_reason: 'Pembeli batal' });

    const detail = await request(app)
      .get(`/api/transactions/${transaksi.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.body.status).toBe('voided');
    expect(detail.body.void_reason).toBe('Pembeli batal');

    const laporan = await request(app)
      .get('/api/transactions')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${token}`);
    const ditemukan = laporan.body.data.find((t: { id: string }) => t.id === transaksi.id);
    expect(ditemukan).toBeDefined();
    expect(ditemukan.status).toBe('voided');
  });

  it('barang yang stoknya sudah kembali bisa langsung dijual lagi', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 1);
    const transaksi = await checkout(token, [{ product_id: productId, qty: 1 }]);

    // stok habis, checkout berikutnya harus ditolak
    const sebelumVoid = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        type: 'walk_in',
        payment_method: 'transfer',
        items: [{ product_id: productId, qty: 1 }],
      });
    expect(sebelumVoid.status).toBe(409);

    await voidTransaction(token, transaksi.id);

    const sesudahVoid = await checkout(token, [{ product_id: productId, qty: 1 }]);
    expect(sesudahVoid.id).toBeTruthy();
    expect(await stockOf(token, productId)).toBe(0);
  });
});
