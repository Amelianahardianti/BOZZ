// backend/test/orders.test.ts

// TASK #9 — Order List & Detail Endpoints (modul ecommerce-sync / Order Hub).
//
// GET /api/orders, GET /api/orders/:id lewat `app` asli (supertest) --
// membuktikan routes.ts -> service.ts -> repository.ts benar-benar
// tersambung: query params (platform_id/status/sla_type/page/limit)
// benar-benar diteruskan ke repository.ts, dan response detail
// benar-benar menyertakan items + shipping address.
//
// repository.ts di-mock total (jest.mock) -- pola sama seperti
// platform-connection.test.ts -- supaya cepat & tidak butuh koneksi
// Supabase. Karena repository di-mock, test ini TIDAK membuktikan filter
// SQL/Prisma-nya sendiri benar (itu sudah tercakup lewat pembacaan kode
// repository.ts: where clause & skip/take langsung dari query object) --
// yang dibuktikan di sini adalah WIRING: parameter HTTP -> object filter
// yang benar-benar dikirim ke repository, dan hasil repository -> response
// HTTP yang benar (bentuk field sesuai ExternalOrderListItem/Detail di
// contracts/api.yaml).
//
// GET /api/orders/:id — 404 "order tidak ditemukan" SUDAH ada test-nya di
// platform-connection.test.ts (Step 8 hardening), sengaja tidak diulang di
// sini supaya tidak duplikat -- dijalankan bersama seluruh suite untuk
// membuktikan masih tetap pass.

import { describe, expect, it, jest, afterEach } from '@jest/globals';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import * as repo from '../src/modules/ecommerce-sync/repository';
import { ownerToken, kasirToken, tokenFor } from './helpers/auth';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.clearAllMocks();
});

type OrderListRow = Awaited<ReturnType<typeof repo.listExternalOrderRows>>[number];
type OrderDetailRow = NonNullable<Awaited<ReturnType<typeof repo.getExternalOrderDetailRow>>>;

const PLATFORM_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

function buildListRow(overrides: Partial<OrderListRow> = {}): OrderListRow {
  return {
    id: randomUUID(),
    platform_id: PLATFORM_ID,
    external_order_id: 'CART-1',
    customer_id: null,
    status: 'new',
    sla_type: 'instant',
    sla_deadline: new Date('2026-01-01T03:00:00.000Z'),
    total_amount: 150000 as unknown as OrderListRow['total_amount'],
    received_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as OrderListRow;
}

describe('GET /api/orders — HTTP (repository.ts di-mock)', () => {
  it('A. list dasar tanpa filter -> 200, response = data dari repository apa adanya', async () => {
    const rows = [buildListRow({ id: 'order-1' }), buildListRow({ id: 'order-2', external_order_id: 'CART-2' })];
    mockedRepo.listExternalOrderRows.mockResolvedValue(rows);

    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'order-1', external_order_id: 'CART-1' });
    expect(res.body[1]).toMatchObject({ id: 'order-2', external_order_id: 'CART-2' });
    // Default pagination (tidak ada page/limit di query) diteruskan apa
    // adanya oleh service.listOrders() -- lihat service.ts: page ?? 1, limit ?? 20.
    expect(mockedRepo.listExternalOrderRows).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 })
    );
  });

  it('B. filter platform_id -> diteruskan ke repository, response cuma order platform itu', async () => {
    const rows = [buildListRow({ id: 'order-platform-a', platform_id: PLATFORM_ID })];
    mockedRepo.listExternalOrderRows.mockResolvedValue(rows);

    const res = await request(app)
      .get('/api/orders')
      .query({ platform_id: PLATFORM_ID })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(mockedRepo.listExternalOrderRows).toHaveBeenCalledWith(
      expect.objectContaining({ platformId: PLATFORM_ID })
    );
    expect(res.body).toHaveLength(1);
    expect(res.body[0].platform_id).toBe(PLATFORM_ID);
  });

  it('C. filter status=processing -> diteruskan ke repository, response cuma status itu', async () => {
    const rows = [buildListRow({ id: 'order-processing', status: 'processing' })];
    mockedRepo.listExternalOrderRows.mockResolvedValue(rows);

    const res = await request(app)
      .get('/api/orders')
      .query({ status: 'processing' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(mockedRepo.listExternalOrderRows).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing' })
    );
    expect(res.body).toEqual([expect.objectContaining({ id: 'order-processing', status: 'processing' })]);
  });

  it('D. filter sla_type=instant -> diteruskan ke repository, response cuma SLA itu', async () => {
    const rows = [buildListRow({ id: 'order-instant', sla_type: 'instant' })];
    mockedRepo.listExternalOrderRows.mockResolvedValue(rows);

    const res = await request(app)
      .get('/api/orders')
      .query({ sla_type: 'instant' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(mockedRepo.listExternalOrderRows).toHaveBeenCalledWith(
      expect.objectContaining({ slaType: 'instant' })
    );
    expect(res.body).toEqual([expect.objectContaining({ id: 'order-instant', sla_type: 'instant' })]);
  });

  it('E. pagination page & limit -> diteruskan persis ke repository (skip/take dihitung repository.ts)', async () => {
    mockedRepo.listExternalOrderRows.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/orders')
      .query({ page: '2', limit: '5' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(mockedRepo.listExternalOrderRows).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5 })
    );
  });

  it('E2. limit membatasi jumlah hasil yang dibalas (bukti pass-through, bukan diklaim)', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => buildListRow({ id: `order-${i}` }));
    mockedRepo.listExternalOrderRows.mockResolvedValue(rows);

    const res = await request(app)
      .get('/api/orders')
      .query({ limit: '3' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(mockedRepo.listExternalOrderRows).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
  });

  it('limit di luar batas (>100) -> 400 VALIDATION_ERROR (kontrak: max 100)', async () => {
    const res = await request(app)
      .get('/api/orders')
      .query({ limit: '101' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('H. RBAC kasir -> 403, RBAC pengepak -> 403 (endpoint owner-only)', async () => {
    const resKasir = await request(app).get('/api/orders').set('Authorization', `Bearer ${kasirToken()}`);
    expect(resKasir.status).toBe(403);
    expect(resKasir.body.error.code).toBe('FORBIDDEN');

    const resPengepak = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${tokenFor('pengepak')}`);
    expect(resPengepak.status).toBe(403);
    expect(resPengepak.body.error.code).toBe('FORBIDDEN');

    expect(mockedRepo.listExternalOrderRows).not.toHaveBeenCalled();
  });
});

describe('GET /api/orders/:id — HTTP (repository.ts di-mock)', () => {
  it('F. detail order lengkap -> 200, id benar, items ada, shipping address ada', async () => {
    const orderId = randomUUID();
    const detail = {
      id: orderId,
      platform_id: PLATFORM_ID,
      external_order_id: 'CART-42',
      customer_id: null,
      status: 'processing',
      sla_type: 'same_day',
      sla_deadline: new Date('2026-01-01T06:00:00.000Z'),
      total_amount: 320000,
      payment_method: 'cod',
      raw_payload: { mock: true },
      received_at: new Date('2026-01-01T00:00:00.000Z'),
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      external_status_raw: null,
      fulfillment_flag: null,
      is_cod: true,
      shipping_carrier: 'JNE Same Day',
      currency: 'IDR',
      paid_at: null,
      days_to_ship: null,
      cancel_by: null,
      cancel_reason: null,
      buyer_message: null,
      seller_note: null,
      dropshipper_name: null,
      dropshipper_phone: null,
      pickup_done_at: null,
      warnings: null,
      external_order_items: [
        { id: randomUUID(), external_order_id: orderId, product_id: null, external_item_ref: '1', item_name_snapshot: 'Sepatu Sneakers 42', qty: 1, unit_price: 320000, created_at: new Date(), order_item_id: null, model_id: '0', model_name: null, model_sku: null, unit_price_original: null, qty_active: null, qty_cancelled: 0, qty_returned: 0, weight: null, is_wholesale: false, image_url: null },
      ],
      order_shipping_address: {
        id: randomUUID(),
        external_order_id: orderId,
        recipient_name: 'Fajar Nugroho',
        phone: '081298765432',
        full_address: 'Jl. Merdeka No. 1',
        city: 'Jakarta',
        district: null,
        town: null,
        state: null,
        zipcode: '12345',
        latitude: null,
        longitude: null,
        created_at: new Date(),
      },
    } as unknown as OrderDetailRow;

    mockedRepo.getExternalOrderDetailRow.mockResolvedValue(detail);

    const res = await request(app).get(`/api/orders/${orderId}`).set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.external_order_id).toBe('CART-42');
    expect(res.body.external_order_items).toHaveLength(1);
    expect(res.body.external_order_items[0]).toMatchObject({ item_name_snapshot: 'Sepatu Sneakers 42', qty: 1 });
    expect(res.body.order_shipping_address).toMatchObject({ recipient_name: 'Fajar Nugroho', city: 'Jakarta' });
  });

  it('H. RBAC kasir -> 403 (endpoint owner-only)', async () => {
    const res = await request(app)
      .get(`/api/orders/${randomUUID()}`)
      .set('Authorization', `Bearer ${kasirToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockedRepo.getExternalOrderDetailRow).not.toHaveBeenCalled();
  });
});
