// backend/test/platform-connection.test.ts

// STEP 8 — Hardening: platform connection flow (connect/disconnect/sync)
// dan unknown-platform/unknown-order, yang sebelumnya 0% ter-test.
//
// Cuma repository.ts (DB) yang di-mock -- adapter registry TIDAK di-mock,
// dipakai APA ADANYA (FakeStore adapter tidak butuh network untuk
// exchangeCodeForToken, cuma nulis ke repository yang sudah di-mock).
// Ini juga sekalian membuktikan fix getAdapter() (Step 8-A: unknown
// platform -> 404 AppError, bukan 500 dari Error polos) bekerja lewat
// endpoint SELAIN webhook (lihat webhook-http.test.ts untuk versi webhook).

import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { app } from '../src/app';
import * as repo from '../src/modules/ecommerce-sync/repository';
import { ownerToken } from './helpers/auth';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/platforms/:platform/connect', () => {
  it('connect berhasil -> 200, adapter dipanggil, respons reflect status baru', async () => {
    mockedRepo.findPlatformRow.mockResolvedValue({
      id: 'platform-uuid-1',
      platform_name: 'fakestore',
      shop_id_external: 'fakestore-demo-shop',
      token_expires_at: new Date(),
      is_connected: true,
      last_synced_at: null,
      last_sync_status: null,
    } as Awaited<ReturnType<typeof repo.findPlatformRow>>);

    const res = await request(app)
      .post('/api/platforms/fakestore/connect')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ oauth_code: 'NO_AUTH_NEEDED' });

    expect(res.status).toBe(200);
    expect(res.body.platform_name).toBe('fakestore');
    expect(res.body.is_connected).toBe(true);
    expect(mockedRepo.upsertPlatformToken).toHaveBeenCalledTimes(1);
  });

  it('oauth_code tidak diisi -> 409 CONFLICT, adapter TIDAK dipanggil', async () => {
    const res = await request(app)
      .post('/api/platforms/fakestore/connect')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(mockedRepo.upsertPlatformToken).not.toHaveBeenCalled();
  });

  it('platform tidak dikenal -> 404 (bukan 500)', async () => {
    const res = await request(app)
      .post('/api/platforms/platform-ngasal/connect')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ oauth_code: 'apa saja' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/platforms/:platform/sync — platform belum terhubung', () => {
  it('platform belum connect (is_connected: false) -> 409, sync TIDAK jalan', async () => {
    mockedRepo.findPlatformRow.mockResolvedValue({
      id: 'platform-uuid-2',
      platform_name: 'fakestore',
      is_connected: false,
    } as Awaited<ReturnType<typeof repo.findPlatformRow>>);

    const res = await request(app)
      .post('/api/platforms/fakestore/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('platform tidak dikenal -> 404', async () => {
    const res = await request(app)
      .post('/api/platforms/platform-ngasal/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send();

    expect(res.status).toBe(404);
  });
});

describe('GET /api/orders/:id — order tidak ditemukan', () => {
  it('order ID tidak dikenal -> 404', async () => {
    mockedRepo.getExternalOrderDetailRow.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/orders/${randomUUID()}`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
