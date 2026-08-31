// backend/test/stock-adjustments.test.ts

// Menguji POST /api/products/:id/stock-adjustments: log stok tercatat,
// stok produk ikut berubah, dan event stock.updated terbit (FR-SI-09).

import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import * as repo from '../src/modules/sales-inventory/repository';
import { OWNER_ID, kasirToken, ownerToken } from './helpers/auth';
import { EVENTS, StockUpdatedPayload, subscribe } from '../src/shared/event-bus';
import { describe, expect, it, jest } from '@jest/globals';

async function seedProduct(token: string, stockQty: number): Promise<string> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Produk Stok ${randomUUID()}`, price: 5000, stock_qty: stockQty });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function stockOf(token: string, productId: string): Promise<number> {
  const res = await request(app)
    .get(`/api/products/${productId}`)
    .set('Authorization', `Bearer ${token}`);
  return res.body.stock_qty as number;
}

function adjust(token: string, productId: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/products/${productId}/stock-adjustments`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('POST /api/products/:id/stock-adjustments', () => {
  it('menambah stok dan mencatatnya di log', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 10);

    const res = await adjust(token, productId, { change_qty: 5, reason: 'restock' });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'adjusted_by_user_id',
      'change_qty',
      'created_at',
      'id',
      'product_id',
      'reason',
      'reference_id',
      'reference_type',
      'stock_after',
      'stock_before',
    ]);
    expect(res.body.product_id).toBe(productId);
    expect(res.body.change_qty).toBe(5);
    expect(res.body.reason).toBe('restock');
    expect(res.body.stock_before).toBe(10);
    expect(res.body.stock_after).toBe(15);
    expect(res.body.reference_type).toBe('manual');
    expect(res.body.reference_id).toBeNull();
    expect(res.body.adjusted_by_user_id).toBe(OWNER_ID);

    expect(await stockOf(token, productId)).toBe(15);

    const log = await repo.listStockAdjustmentsByProduct(productId);
    expect(log).toHaveLength(1);
    expect(log[0].id).toBe(res.body.id);
  });

  it('mengurangi stok kalau change_qty negatif', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 10);

    const res = await adjust(token, productId, { change_qty: -4, reason: 'manual_adjustment' });

    expect(res.status).toBe(201);
    expect(res.body.stock_before).toBe(10);
    expect(res.body.stock_after).toBe(6);
    expect(await stockOf(token, productId)).toBe(6);
  });

  it('boleh mengosongkan stok sampai tepat 0', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 3);

    const res = await adjust(token, productId, { change_qty: -3, reason: 'manual_adjustment' });

    expect(res.status).toBe(201);
    expect(res.body.stock_after).toBe(0);
  });

  it('mempublikasikan event stock.updated setelah tercatat', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 8);

    const diterima: StockUpdatedPayload[] = [];
    const berhenti = subscribe(EVENTS.STOCK_UPDATED, (payload) => {
      diterima.push(payload);
    });

    try {
      await adjust(token, productId, { change_qty: 12, reason: 'restock' });
    } finally {
      berhenti();
    }

    const milikKita = diterima.filter((p) => p.product_id === productId);
    expect(milikKita).toHaveLength(1);
    expect(milikKita[0].change_qty).toBe(12);
    expect(milikKita[0].stock_after).toBe(20);
    expect(milikKita[0].reason).toBe('restock');
    expect(milikKita[0].occurred_at).toBeTruthy();
  });

  it('menolak kalau stok jadi minus, tanpa mengubah stok atau menulis log', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 2);

    const res = await adjust(token, productId, { change_qty: -5, reason: 'manual_adjustment' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toMatch(/tinggal 2/);
    expect(await stockOf(token, productId)).toBe(2);
    expect(await repo.listStockAdjustmentsByProduct(productId)).toHaveLength(0);
  });

  it('membalas 404 kalau produknya tidak ada', async () => {
    const token = ownerToken();

    const res = await adjust(token, 'produk-hantu', { change_qty: 1, reason: 'restock' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('menolak change_qty 0 dan yang bukan bilangan bulat', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 5);

    for (const change_qty of [0, 1.5]) {
      const res = await adjust(token, productId, { change_qty, reason: 'restock' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await stockOf(token, productId)).toBe(5);
  });

  it('menolak alasan yang dicatat sistem sendiri (sale, void_reversal, external_order)', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 5);

    for (const reason of ['sale', 'void_reversal', 'external_order', 'apa_saja']) {
      const res = await adjust(token, productId, { change_qty: 1, reason });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/manual_adjustment|restock/);
    }
    expect(await stockOf(token, productId)).toBe(5);
  });

  it('menolak body tanpa change_qty atau tanpa reason', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 5);

    expect((await adjust(token, productId, { reason: 'restock' })).status).toBe(400);
    expect((await adjust(token, productId, { change_qty: 1 })).status).toBe(400);
  });

  it('melarang role selain owner menyesuaikan stok', async () => {
    const owner = ownerToken();
    const productId = await seedProduct(owner, 5);
    const kasir = kasirToken();

    const res = await adjust(kasir, productId, { change_qty: 1, reason: 'restock' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('menolak request tanpa token', async () => {
    const owner = ownerToken();
    const productId = await seedProduct(owner, 5);

    const res = await request(app)
      .post(`/api/products/${productId}/stock-adjustments`)
      .send({ change_qty: 1, reason: 'restock' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('mencatat tiap penyesuaian berurutan, stock_before menyambung ke yang sebelumnya', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 10);

    await adjust(token, productId, { change_qty: 5, reason: 'restock' });
    await adjust(token, productId, { change_qty: -3, reason: 'manual_adjustment' });

    const log = await repo.listStockAdjustmentsByProduct(productId);
    expect(log).toHaveLength(2);
    expect(log[0].stock_after).toBe(15);
    expect(log[1].stock_before).toBe(15);
    expect(log[1].stock_after).toBe(12);
    expect(await stockOf(token, productId)).toBe(12);
  });

  it('tidak bentrok dengan checkout yang jalan bersamaan', async () => {
    const token = ownerToken();
    const productId = await seedProduct(token, 1);

    // Checkout membeli barang terakhir, di saat yang sama stok dikurangi
    // manual. Cuma satu yang boleh berhasil; stok tidak boleh minus.
    const [checkoutRes, adjustRes] = await Promise.all([
      request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          type: 'walk_in',
          payment_method: 'transfer',
          items: [{ product_id: productId, qty: 1 }],
        }),
      adjust(token, productId, { change_qty: -1, reason: 'manual_adjustment' }),
    ]);

    const status = [checkoutRes.status, adjustRes.status].sort();
    expect(status).toEqual([201, 409]);
    expect(await stockOf(token, productId)).toBe(0);
  });
});
