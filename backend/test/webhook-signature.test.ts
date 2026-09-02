// backend/test/webhook-signature.test.ts

// TEST #5 — Invalid Webhook Signature (modul ecommerce-sync / Order Hub).
//
// Dua lapis yang diuji terpisah:
//
//  1. handleWebhook() di service.ts -- branching logic: 401 UNAUTHORIZED
//     kalau adapter bilang signature invalid (Step 8 hardening -- sebelumnya
//     409, diperbaiki supaya sesuai SRS 9.5 & contracts/api.yaml yang dari
//     awal sudah mendefinisikan 401 buat signature invalid), lanjut ke
//     upsertExternalOrder() kalau valid, dan 409 (BUKAN 401 -- ini bukan
//     soal signature) kalau platform belum dukung webhook sama sekali.
//     repository.ts & adapter registry di-mock -- verifyWebhookSignature
//     di-kontrol lewat mock adapter di sini supaya fokus ke branching-nya
//     handleWebhook, BUKAN detail HMAC (itu bagian 2). Test level HTTP
//     (respons beneran 401, bukan 200 duluan) ada di webhook-http.test.ts.
//
//  2. tiktokAdapter.verifyWebhookSignature() ASLI (HMAC-SHA256) -- TIDAK
//     di-mock sama sekali. TIKTOK_APP_KEY/TIKTOK_APP_SECRET di-override ke
//     nilai test yang diketahui (bukan bergantung ke .env asli) supaya HMAC
//     bisa dihitung ulang di test dan dibandingkan ke hasil fungsi produksi.

import { handleWebhook } from '../src/modules/ecommerce-sync/service';
import * as repo from '../src/modules/ecommerce-sync/repository';
import * as registry from '../src/modules/ecommerce-sync/adapters/registry';
import { tiktokAdapter } from '../src/modules/ecommerce-sync/adapters/tiktok';
import type { PlatformAdapter, NormalizedOrder } from '../src/modules/ecommerce-sync/types';
import { createHmac } from 'crypto';
import { describe, expect, it, jest, afterEach, beforeEach, afterAll } from '@jest/globals';

jest.mock('../src/modules/ecommerce-sync/repository');
jest.mock('../src/modules/ecommerce-sync/adapters/registry');

const mockedRepo = repo as jest.Mocked<typeof repo>;
const mockedGetAdapter = registry.getAdapter as jest.MockedFunction<typeof registry.getAdapter>;

function fakeAdapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    name: 'test-platform',
    buildAuthorizationUrl: jest.fn<PlatformAdapter['buildAuthorizationUrl']>(),
    exchangeCodeForToken: jest.fn<PlatformAdapter['exchangeCodeForToken']>(),
    getValidAccessToken: jest.fn<PlatformAdapter['getValidAccessToken']>(),
    fetchRecentOrders: jest.fn<PlatformAdapter['fetchRecentOrders']>(),
    ...overrides,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetAllMocks();
});

describe('handleWebhook — branching berdasarkan verifyWebhookSignature', () => {
  it('signature invalid -> throw UNAUTHORIZED (401), pipeline order TIDAK dijalankan', async () => {
    const verifyWebhookSignature = jest.fn<NonNullable<PlatformAdapter['verifyWebhookSignature']>>().mockReturnValue(false);
    const normalizeWebhookPayload = jest.fn<NonNullable<PlatformAdapter['normalizeWebhookPayload']>>();
    mockedGetAdapter.mockReturnValue(fakeAdapter({ verifyWebhookSignature, normalizeWebhookPayload }));

    await expect(handleWebhook('tiktok', 'raw-body', {}, {})).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });

    expect(verifyWebhookSignature).toHaveBeenCalledWith('raw-body', {});
    expect(normalizeWebhookPayload).not.toHaveBeenCalled();
    expect(mockedRepo.upsertExternalOrderRow).not.toHaveBeenCalled();
  });

  it('signature valid -> lanjut proses, upsertExternalOrder() beneran dipanggil', async () => {
    const normalizedOrder: NormalizedOrder = {
      externalOrderId: 'TT-1',
      status: 'new',
      rawPayload: { mock: true },
      items: [],
    };
    const verifyWebhookSignature = jest.fn<NonNullable<PlatformAdapter['verifyWebhookSignature']>>().mockReturnValue(true);
    const normalizeWebhookPayload = jest
      .fn<NonNullable<PlatformAdapter['normalizeWebhookPayload']>>()
      .mockReturnValue(normalizedOrder);
    mockedGetAdapter.mockReturnValue(fakeAdapter({ verifyWebhookSignature, normalizeWebhookPayload }));

    mockedRepo.findPlatformRow.mockResolvedValue({
      id: 'platform-uuid-tiktok',
    } as Awaited<ReturnType<typeof repo.findPlatformRow>>);
    mockedRepo.findExternalOrder.mockResolvedValue(null);
    mockedRepo.upsertExternalOrderRow.mockResolvedValue({
      id: 'order-uuid-1',
    } as Awaited<ReturnType<typeof repo.upsertExternalOrderRow>>);

    await handleWebhook('tiktok', 'raw-body', { authorization: 'sig' }, { data: { id: 'TT-1' } });

    expect(normalizeWebhookPayload).toHaveBeenCalledWith({ data: { id: 'TT-1' } });
    expect(mockedRepo.upsertExternalOrderRow).toHaveBeenCalledTimes(1);
    const savedInput = mockedRepo.upsertExternalOrderRow.mock.calls[0][0];
    expect(savedInput.externalOrderId).toBe('TT-1');
    expect(savedInput.platformId).toBe('platform-uuid-tiktok');
  });

  it('platform belum dukung webhook (adapter tanpa verifyWebhookSignature/normalizeWebhookPayload) -> throw CONFLICT', async () => {
    mockedGetAdapter.mockReturnValue(fakeAdapter()); // tanpa verifyWebhookSignature & normalizeWebhookPayload

    await expect(handleWebhook('fakestore', 'raw-body', {}, {})).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
    expect(mockedRepo.upsertExternalOrderRow).not.toHaveBeenCalled();
  });
});

describe('tiktokAdapter.verifyWebhookSignature — HMAC production logic (asli, tidak di-mock)', () => {
  const ORIGINAL_APP_KEY = process.env.TIKTOK_APP_KEY;
  const ORIGINAL_APP_SECRET = process.env.TIKTOK_APP_SECRET;

  beforeEach(() => {
    process.env.TIKTOK_APP_KEY = 'test-app-key';
    process.env.TIKTOK_APP_SECRET = 'test-app-secret';
  });

  afterAll(() => {
    process.env.TIKTOK_APP_KEY = ORIGINAL_APP_KEY;
    process.env.TIKTOK_APP_SECRET = ORIGINAL_APP_SECRET;
  });

  function expectedSignature(rawBody: string): string {
    // Rumus SAMA PERSIS dengan adapters/tiktok/index.ts: HMAC-SHA256(appSecret, appKey + rawBody).
    return createHmac('sha256', 'test-app-secret').update('test-app-key' + rawBody).digest('hex');
  }

  it('HMAC benar -> true', () => {
    const rawBody = '{"data":{"id":"TT-1"}}';
    const signature = expectedSignature(rawBody);

    expect(tiktokAdapter.verifyWebhookSignature!(rawBody, { authorization: signature })).toBe(true);
  });

  it('header signature hilang -> false', () => {
    expect(tiktokAdapter.verifyWebhookSignature!('{"data":{"id":"TT-1"}}', {})).toBe(false);
  });

  it('signature salah -> false', () => {
    expect(
      tiktokAdapter.verifyWebhookSignature!('{"data":{"id":"TT-1"}}', { authorization: 'signature-ngasal' })
    ).toBe(false);
  });
});
