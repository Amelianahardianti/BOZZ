// backend/test/webhook-demo-simulator.test.ts

// External E-commerce Order Simulator — webhook integration boundary
// (requirement §9/§10). Membuktikan Shopee Mock & Tokopedia Mock
// SEKARANG bisa menerima webhook sungguhan lewat HTTP (sebelumnya 409,
// cuma TikTok yang bisa), pakai signature HMAC-SHA256 yang sama pola-nya
// dengan TikTok asli tapi kunci bersama (verifyDemoWebhookSignature).
//
// Pola test PERSIS webhook-http.test.ts (request HTTP sungguhan lewat
// `app`, bukan panggil service langsung) -- cuma platform-nya diganti
// shopee/tokopedia, dan adapter registry TIDAK dimock (adapter aslinya
// dites, bukan tiruan).

import request from 'supertest';
import { createHmac } from 'crypto';
import { describe, expect, it, jest, beforeEach, afterAll } from '@jest/globals';
import { app } from '../src/app';
import * as repo from '../src/modules/ecommerce-sync/repository';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

const ORIGINAL_MOCK_SHOPEE = process.env.MOCK_SHOPEE;
const ORIGINAL_WEBHOOK_SECRET = process.env.MOCK_WEBHOOK_SECRET;

beforeEach(() => {
  // Adapter registry di-load SEKALI saat modul di-import (top-level
  // `mockShopee = process.env.MOCK_SHOPEE === 'true'` di registry.ts) --
  // .env project ini SUDAH MOCK_SHOPEE=true, jadi tidak perlu diubah di
  // sini, cukup didokumentasikan sebagai prasyarat test ini.
  process.env.MOCK_WEBHOOK_SECRET = 'test-demo-webhook-secret';
  jest.clearAllMocks();
});

afterAll(() => {
  process.env.MOCK_SHOPEE = ORIGINAL_MOCK_SHOPEE;
  process.env.MOCK_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
});

function signOf(platformName: string, rawBody: string): string {
  return createHmac('sha256', 'test-demo-webhook-secret').update(platformName + rawBody).digest('hex');
}

const DEMO_PAYLOAD = {
  external_order_id: 'SHP-DEMO-TEST-001',
  buyer_username: 'Budi',
  items: [{ external_item_id: 'SHP-BOZZ-BAG-001', item_name: 'Fjallraven Backpack', qty: 2, unit_price: 350000 }],
};

describe('POST /api/webhooks/shopee — simulator payload (Shopee Mock, sebelumnya 409)', () => {
  it('signature valid -> HTTP 200, pipeline order lanjut jalan (bukan lagi 409)', async () => {
    mockedRepo.findPlatformRow.mockResolvedValue(null); // platform belum ada row -> pipeline berhenti aman di sini, cukup buktikan LOLOS dari verifikasi

    const rawBody = JSON.stringify(DEMO_PAYLOAD);
    const res = await request(app)
      .post('/api/webhooks/shopee')
      .set('Authorization', signOf('shopee', rawBody))
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('signature invalid -> HTTP 401, BUKAN 200', async () => {
    const rawBody = JSON.stringify(DEMO_PAYLOAD);
    const res = await request(app)
      .post('/api/webhooks/shopee')
      .set('Authorization', 'signature-ngasal')
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('order sampai ke upsertExternalOrderRow() dengan externalItemRef = external_item_id dari payload, TANPA productId (BOZZ yang resolve, bukan simulator)', async () => {
    const platformRow = { id: 'platform-uuid-shopee', platform_name: 'shopee' } as Awaited<
      ReturnType<typeof repo.findPlatformRow>
    >;
    mockedRepo.findPlatformRow.mockResolvedValue(platformRow);
    mockedRepo.findExternalOrder.mockResolvedValue(null);
    mockedRepo.findCustomerByExternalUsername.mockResolvedValue(null);
    mockedRepo.createCustomerFromMarketplace.mockResolvedValue({
      id: 'customer-uuid-1',
    } as Awaited<ReturnType<typeof repo.createCustomerFromMarketplace>>);
    mockedRepo.upsertExternalOrderRow.mockResolvedValue({
      id: 'order-uuid-1',
    } as Awaited<ReturnType<typeof repo.upsertExternalOrderRow>>);

    const rawBody = JSON.stringify(DEMO_PAYLOAD);
    const res = await request(app)
      .post('/api/webhooks/shopee')
      .set('Authorization', signOf('shopee', rawBody))
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(200);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockedRepo.upsertExternalOrderRow).toHaveBeenCalledTimes(1);
    const saved = mockedRepo.upsertExternalOrderRow.mock.calls[0][0];
    expect(saved.externalOrderId).toBe('SHP-DEMO-TEST-001');
    expect(saved.items).toEqual([
      { externalItemRef: 'SHP-BOZZ-BAG-001', itemName: 'Fjallraven Backpack', qty: 2, unitPrice: 350000 },
    ]);
    // Tidak ada field productId di objek yang dikirim ke repository --
    // simulator tidak pernah menyuntikkan internal product_id BOZZ.
    expect('productId' in saved.items[0]).toBe(false);
  });
});

describe('POST /api/webhooks/tokopedia — simulator payload (Tokopedia Mock, sebelumnya 409)', () => {
  it('signature valid -> HTTP 200', async () => {
    mockedRepo.findPlatformRow.mockResolvedValue(null);

    const payload = { ...DEMO_PAYLOAD, external_order_id: 'TKP-DEMO-TEST-001' };
    const rawBody = JSON.stringify(payload);
    const res = await request(app)
      .post('/api/webhooks/tokopedia')
      .set('Authorization', signOf('tokopedia', rawBody))
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(200);
  });

  it('signature dihitung buat "shopee" TIDAK valid buat "tokopedia" walau body sama persis', async () => {
    const rawBody = JSON.stringify(DEMO_PAYLOAD);
    const res = await request(app)
      .post('/api/webhooks/tokopedia')
      .set('Authorization', signOf('shopee', rawBody)) // signature platform LAIN
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(401);
  });
});
