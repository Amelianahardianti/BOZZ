// backend/test/platform-sync.test.ts

// TASK #11 — Manual Platform Sync Trigger (modul ecommerce-sync / Order Hub).
//
// Guard-nya (platform belum connect -> 409, platform tak dikenal -> 404)
// SUDAH ada test-nya di platform-connection.test.ts (Step 8 hardening) --
// sengaja tidak diulang di sini, dijalankan bersama seluruh suite untuk
// membuktikan masih tetap pass.
//
// Yang BELUM ada test-nya sebelum ini (gap yang bikin task #11 PARTIAL):
// jalur SUKSES POST /platforms/:platform/sync -- apakah response 202
// benar-benar berbentuk sesuai kontrak (schema Platform), dan apakah
// runSync() di background (service.ts) benar-benar memanggil
// adapter.fetchRecentOrders() lalu meng-upsert tiap order serta mencatat
// last_sync_status. Karena runSync() sengaja TIDAK ditunggu request HTTP
// (`void runSync(...).catch(...)`, SRS 9.8 -- balas cepat, proses berat di
// background), test ini flush event loop dulu (pola sama dengan
// order-status-changed-consumer.test.ts / ticket-completion-forwards-to-platform.test.ts)
// sebelum meng-assert efek background-nya.
//
// repository.ts & adapters/registry di-mock (pola sama dengan
// ticket-completion-forwards-to-platform.test.ts): getAdapter() tetap
// perilaku ASLI (unknown platform -> notFound), isi platformAdapters
// deterministik (bukan tergantung MOCK_SHOPEE/MOCK_TIKTOK di .env).

import { describe, expect, it, jest, afterEach, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app';
import * as repo from '../src/modules/ecommerce-sync/repository';
import * as registry from '../src/modules/ecommerce-sync/adapters/registry';
import * as authRepo from '../src/modules/auth-product/repository';
import type { PlatformAdapter, PlatformCredentials, NormalizedOrder } from '../src/modules/ecommerce-sync/types';
import { ownerToken, kasirToken, tokenFor } from './helpers/auth';

jest.mock('../src/modules/ecommerce-sync/repository');

// Order baru yang berhasil di-upsert mem-publish EVENTS.ORDER_RECEIVED
// (service.ts) -- karena test ini pakai `app` asli, subscriber PRODUKSI
// sales-inventory ikut ter-load dan bereaksi (lihat
// order-received-consumer.test.ts). Tanpa mock ini, subscriber itu akan
// memanggil auth-product/repository sungguhan ke Postgres asli. Pola sama
// dengan ticket-completion-forwards-to-platform.test.ts.
jest.mock('../src/modules/auth-product/repository');

jest.mock('../src/modules/ecommerce-sync/adapters/registry', () => {
  const { notFound } = jest.requireActual('../src/shared/errors') as typeof import('../src/shared/errors');

  const adapters: Record<string, unknown> = {
    fakestore: {
      name: 'fakestore',
      buildAuthorizationUrl: jest.fn(),
      exchangeCodeForToken: jest.fn(),
      getValidAccessToken: jest
        .fn<() => Promise<PlatformCredentials>>()
        .mockResolvedValue({ shopIdExternal: 'fakestore-demo-shop', accessToken: 'no-auth-needed' }),
      fetchRecentOrders: jest.fn<() => Promise<NormalizedOrder[]>>(),
    },
  };

  return {
    platformAdapters: adapters,
    isPlatformConfigured: jest.fn(() => true),
    getAdapter: (platformName: string) => {
      const adapter = adapters[platformName];
      if (!adapter) throw notFound(`Platform "${platformName}" tidak dikenal.`);
      return adapter;
    },
  };
});

const mockedRepo = repo as jest.Mocked<typeof repo>;
const mockedAuthRepo = authRepo as jest.Mocked<typeof authRepo>;
const fakestoreAdapterMock = registry.platformAdapters.fakestore as unknown as {
  getValidAccessToken: jest.MockedFunction<PlatformAdapter['getValidAccessToken']>;
  fetchRecentOrders: jest.MockedFunction<PlatformAdapter['fetchRecentOrders']>;
};

beforeEach(() => {
  // Default: tidak ada staf owner untuk dikabari -- cukup supaya
  // subscriber ORDER_RECEIVED selesai bersih tanpa efek samping yang perlu
  // di-assert di sini (itu sudah tugas order-received-consumer.test.ts).
  mockedAuthRepo.listStaff.mockResolvedValue([]);
});

async function flushAsync(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const CONNECTED_ROW = {
  id: 'platform-uuid-fakestore',
  platform_name: 'fakestore',
  shop_id_external: 'fakestore-demo-shop',
  token_expires_at: new Date('2026-01-01T04:00:00.000Z'),
  is_connected: true,
  last_synced_at: null,
  last_sync_status: null,
} as Awaited<ReturnType<typeof repo.findPlatformRow>>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/platforms/:platform/sync — jalur sukses', () => {
  it('1. owner, platform sudah connect -> 202, response shape sesuai kontrak (schema Platform)', async () => {
    mockedRepo.findPlatformRow.mockResolvedValue(CONNECTED_ROW);
    fakestoreAdapterMock.fetchRecentOrders.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/platforms/fakestore/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send();

    expect(res.status).toBe(202);
    // Bentuk response harus persis field-field schema Platform di
    // contracts/api.yaml (bukan field lain, bukan bungkus tambahan).
    expect(Object.keys(res.body).sort()).toEqual(
      ['configured', 'id', 'is_connected', 'last_sync_status', 'last_synced_at', 'platform_name', 'shop_id_external', 'token_expires_at'].sort()
    );
    expect(res.body).toMatchObject({
      id: 'platform-uuid-fakestore',
      platform_name: 'fakestore',
      is_connected: true,
    });
  });

  it('runSync() di background benar-benar memanggil fetchRecentOrders(), meng-upsert tiap order, lalu mencatat last_sync_status=success', async () => {
    mockedRepo.findPlatformRow.mockResolvedValue(CONNECTED_ROW);
    mockedRepo.findCustomerByExternalUsername.mockResolvedValue(null);
    mockedRepo.createCustomerFromMarketplace.mockResolvedValue({
      id: 'customer-uuid-1',
    } as Awaited<ReturnType<typeof repo.createCustomerFromMarketplace>>);
    mockedRepo.findExternalOrder.mockResolvedValue(null);
    mockedRepo.upsertExternalOrderRow.mockResolvedValue({
      id: 'order-uuid-1',
    } as Awaited<ReturnType<typeof repo.upsertExternalOrderRow>>);

    const fetchedOrders: NormalizedOrder[] = [
      {
        externalOrderId: 'CART-901',
        status: 'new',
        totalAmount: 150000,
        buyerUsername: 'rina_amelia',
        rawPayload: { mock: true },
        items: [{ itemName: 'Kaos Polos Hitam L', qty: 2, unitPrice: 75000 }],
      },
      {
        externalOrderId: 'CART-902',
        status: 'shipped',
        totalAmount: 320000,
        buyerUsername: 'fajar_nugroho',
        rawPayload: { mock: true },
        items: [{ itemName: 'Sepatu Sneakers 42', qty: 1, unitPrice: 320000 }],
      },
    ];
    fakestoreAdapterMock.fetchRecentOrders.mockResolvedValue(fetchedOrders);

    const res = await request(app)
      .post('/api/platforms/fakestore/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send();

    expect(res.status).toBe(202);

    await flushAsync();

    expect(fakestoreAdapterMock.getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(fakestoreAdapterMock.fetchRecentOrders).toHaveBeenCalledWith(
      { shopIdExternal: 'fakestore-demo-shop', accessToken: 'no-auth-needed' },
      expect.any(Number)
    );
    // Kedua order hasil fetch benar-benar di-upsert lewat pipeline produksi
    // yang sama (upsertExternalOrder -- sudah ter-test detail di
    // order-ingestion.test.ts), bukan cuma di-fetch lalu dibuang.
    expect(mockedRepo.upsertExternalOrderRow).toHaveBeenCalledTimes(2);
    expect(mockedRepo.upsertExternalOrderRow.mock.calls[0][0]).toMatchObject({ externalOrderId: 'CART-901' });
    expect(mockedRepo.upsertExternalOrderRow.mock.calls[1][0]).toMatchObject({ externalOrderId: 'CART-902' });

    expect(mockedRepo.markSyncResult).toHaveBeenCalledWith('fakestore', 'success');
  });

  it('runSync() gagal (adapter error) -> last_sync_status dicatat "failed", request HTTP tetap sudah 202 sebelumnya', async () => {
    mockedRepo.findPlatformRow.mockResolvedValue(CONNECTED_ROW);
    fakestoreAdapterMock.fetchRecentOrders.mockRejectedValue(new Error('FakeStoreAPI timeout'));

    const res = await request(app)
      .post('/api/platforms/fakestore/sync')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send();

    expect(res.status).toBe(202);

    await flushAsync();

    expect(mockedRepo.markSyncResult).toHaveBeenCalledWith('fakestore', 'failed');
    expect(mockedRepo.upsertExternalOrderRow).not.toHaveBeenCalled();
  });
});

describe('POST /api/platforms/:platform/sync — RBAC', () => {
  // routes.ts mendaftarkan endpoint ini dengan requireRole('owner') SAJA --
  // kasir & pengepak sama-sama ditolak. Diuji apa adanya sesuai kode, bukan
  // ditambah akses baru untuk kasir.
  it('3a. kasir -> 403 FORBIDDEN (endpoint owner-only, bukan "owner/kasir" seperti dugaan awal)', async () => {
    const res = await request(app)
      .post('/api/platforms/fakestore/sync')
      .set('Authorization', `Bearer ${kasirToken()}`)
      .send();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockedRepo.findPlatformRow).not.toHaveBeenCalled();
  });

  it('3b. pengepak -> 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/platforms/fakestore/sync')
      .set('Authorization', `Bearer ${tokenFor('pengepak')}`)
      .send();

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockedRepo.findPlatformRow).not.toHaveBeenCalled();
  });

  it('tanpa token -> 401 UNAUTHORIZED', async () => {
    const res = await request(app).post('/api/platforms/fakestore/sync').send();

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
