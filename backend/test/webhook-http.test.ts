// backend/test/webhook-http.test.ts

// STEP 8 — Hardening: webhook security, level HTTP asli (bukan panggil
// service.ts langsung seperti webhook-signature.test.ts).
//
// Sebelum perbaikan Step 8, routes.ts membalas res.status(200) SEBELUM
// service.handleWebhook() (tempat verifikasi signature terjadi) sempat
// jalan -- akibatnya signature invalid TETAP dibalas 200 ke pengirim
// webhook, kontrak 401 di contracts/api.yaml tidak pernah benar-benar
// tercapai secara HTTP. Test ini membuktikan lewat request HTTP SUNGGUHAN
// (supertest ke `app` asli) bahwa sekarang responsnya benar:
//   - signature valid -> 200
//   - signature invalid -> 401 (BUKAN 200 dulu baru gagal diam-diam)
//   - signature hilang -> 401
//   - platform tidak dikenal -> 404
//   - platform dikenal tapi belum dukung webhook (FakeStore) -> 409
//
// TikTok dipakai sebagai platform yang webhook-nya didukung (satu-satunya
// yang implement verifyWebhookSignature). TIKTOK_APP_KEY/SECRET
// di-override ke nilai test, sama pola dengan webhook-signature.test.ts --
// TIDAK bergantung ke .env asli.
//
// adapters/registry.ts di-mock supaya TIDAK bergantung ke MOCK_TIKTOK/
// MOCK_SHOPEE di .env (kalau true, registry aslinya pakai mock adapter
// yang tidak punya method webhook sama sekali) -- getAdapter() di sini
// tetap perilaku ASLI (unknown platform -> notFound), cuma isi
// platformAdapters-nya dipastikan deterministik: tiktokAdapter &
// fakestoreAdapter ASLI (via requireActual), bukan tergantung env.
//
// repository.ts di-mock (tidak ada DB asli). Untuk kasus signature valid,
// findPlatformRow() sengaja resolve null -- itu sudah cukup membuktikan
// pipeline lanjut jalan (bukan berhenti di verifikasi), detail
// ingestion-nya sendiri sudah dites tuntas di order-ingestion.test.ts.

import request from 'supertest';
import { createHmac } from 'crypto';
import { describe, expect, it, jest, beforeEach, afterAll } from '@jest/globals';
import { app } from '../src/app';
import * as repo from '../src/modules/ecommerce-sync/repository';

jest.mock('../src/modules/ecommerce-sync/repository');

jest.mock('../src/modules/ecommerce-sync/adapters/registry', () => {
  const { tiktokAdapter } = jest.requireActual(
    '../src/modules/ecommerce-sync/adapters/tiktok'
  ) as typeof import('../src/modules/ecommerce-sync/adapters/tiktok');
  const { fakestoreAdapter } = jest.requireActual(
    '../src/modules/ecommerce-sync/adapters/fakestore'
  ) as typeof import('../src/modules/ecommerce-sync/adapters/fakestore');
  const { notFound } = jest.requireActual('../src/shared/errors') as typeof import('../src/shared/errors');

  const adapters: Record<string, unknown> = { tiktok: tiktokAdapter, fakestore: fakestoreAdapter };

  return {
    platformAdapters: adapters,
    isPlatformConfigured: jest.fn(),
    // Perilaku ASLI getAdapter() (Step 8-A: unknown platform -> notFound),
    // cuma sumber adapter-nya deterministik (tidak lewat toggle MOCK_TIKTOK).
    getAdapter: (platformName: string) => {
      const adapter = adapters[platformName];
      if (!adapter) throw notFound(`Platform "${platformName}" tidak dikenal.`);
      return adapter;
    },
  };
});

const mockedRepo = repo as jest.Mocked<typeof repo>;

const ORIGINAL_APP_KEY = process.env.TIKTOK_APP_KEY;
const ORIGINAL_APP_SECRET = process.env.TIKTOK_APP_SECRET;

beforeEach(() => {
  process.env.TIKTOK_APP_KEY = 'test-app-key';
  process.env.TIKTOK_APP_SECRET = 'test-app-secret';
  jest.clearAllMocks();
});

afterAll(() => {
  process.env.TIKTOK_APP_KEY = ORIGINAL_APP_KEY;
  process.env.TIKTOK_APP_SECRET = ORIGINAL_APP_SECRET;
});

function signOf(rawBody: string): string {
  return createHmac('sha256', 'test-app-secret').update('test-app-key' + rawBody).digest('hex');
}

describe('POST /api/webhooks/:platform — hardening HTTP asli', () => {
  it('signature valid -> HTTP 200', async () => {
    mockedRepo.findPlatformRow.mockResolvedValue(null); // platform belum connect -> pipeline berhenti aman setelahnya, bukan fokus test ini

    const body = { data: { id: 'TT-1' } };
    const rawBody = JSON.stringify(body);

    const res = await request(app)
      .post('/api/webhooks/tiktok')
      .set('Authorization', signOf(rawBody))
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('signature invalid -> HTTP 401, BUKAN 200', async () => {
    const body = { data: { id: 'TT-1' } };
    const rawBody = JSON.stringify(body);

    const res = await request(app)
      .post('/api/webhooks/tiktok')
      .set('Authorization', 'signature-ngasal-pasti-salah')
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    // Pipeline order TIDAK boleh sempat jalan sama sekali.
    expect(mockedRepo.findPlatformRow).not.toHaveBeenCalled();
  });

  it('signature hilang (header Authorization tidak dikirim) -> HTTP 401', async () => {
    const res = await request(app)
      .post('/api/webhooks/tiktok')
      .set('Content-Type', 'application/json')
      .send({ data: { id: 'TT-1' } });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('platform tidak dikenal -> HTTP 404 (bukan 500, bukan 200)', async () => {
    const res = await request(app)
      .post('/api/webhooks/platform-ngasal-yang-gak-ada')
      .set('Content-Type', 'application/json')
      .send({ apa: 'saja' });

    expect(res.status).toBe(404);
  });

  it('platform dikenal tapi belum dukung webhook (FakeStore) -> HTTP 409, bukan 401', async () => {
    const res = await request(app)
      .post('/api/webhooks/fakestore')
      .set('Content-Type', 'application/json')
      .send({ apa: 'saja' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});
