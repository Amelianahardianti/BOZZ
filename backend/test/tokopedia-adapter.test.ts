// backend/test/tokopedia-adapter.test.ts

// Tokopedia Mock Adapter (adapters/tokopedia/index.ts) — PART B.
//
// BUKAN test integrasi produksi -- tidak ada HTTP request ke Tokopedia
// sungguhan. Membuktikan 4 kapabilitas minimal yang diminta (connect,
// sync/receive order, update status order, update stock), semuanya
// lewat state in-memory adapter ini sendiri. repository.ts di-mock
// supaya exchangeCodeForToken (yang menulis token) tidak butuh DB asli.
//
// TEST 3 (task stock.updated) ada di describe 'updateStockOnPlatform' di
// bawah: state stok benar-benar berubah, dibuktikan lewat getMockStock(),
// bukan cuma dipanggil.

import { describe, expect, it, jest, afterEach } from '@jest/globals';
import {
  tokopediaAdapter,
  getMockOrderStatus,
  getMockStock,
} from '../src/modules/ecommerce-sync/adapters/tokopedia';
import * as repo from '../src/modules/ecommerce-sync/repository';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;
const CREDS = { shopIdExternal: 'MOCK-SHOP-TOKOPEDIA', accessToken: 'mock-access-token' };

afterEach(() => {
  jest.clearAllMocks();
});

describe('tokopediaAdapter — identitas & kontrak PlatformAdapter', () => {
  it('nama adapter adalah "tokopedia"', () => {
    expect(tokopediaAdapter.name).toBe('tokopedia');
  });

  it('TIDAK ada HTTP request ke API Tokopedia asli -- buildAuthorizationUrl murni string lokal, bukan domain Tokopedia', () => {
    const url = tokopediaAdapter.buildAuthorizationUrl();
    expect(url).not.toContain('tokopedia.com');
    expect(url).toContain('code=MOCK_CODE');
  });
});

describe('1. Connect platform', () => {
  it('exchangeCodeForToken menyimpan token (via repository, terenkripsi di layer repo) dan mengembalikan shopIdExternal', async () => {
    mockedRepo.upsertPlatformToken.mockResolvedValue({} as Awaited<ReturnType<typeof repo.upsertPlatformToken>>);

    const result = await tokopediaAdapter.exchangeCodeForToken('MOCK_CODE');

    expect(mockedRepo.upsertPlatformToken).toHaveBeenCalledWith(
      'tokopedia',
      expect.objectContaining({ shopIdExternal: 'MOCK-SHOP-TOKOPEDIA', accessToken: 'mock-access-token' })
    );
    expect(result.shopIdExternal).toBe('MOCK-SHOP-TOKOPEDIA');
  });

  it('getValidAccessToken mengembalikan kredensial mock tanpa perlu koneksi asli', async () => {
    const creds = await tokopediaAdapter.getValidAccessToken();
    expect(creds).toEqual(CREDS);
  });
});

describe('2. Sync / receive order', () => {
  it('fetchRecentOrders mengembalikan fixture order tetap (bukan network call)', async () => {
    const orders = await tokopediaAdapter.fetchRecentOrders(CREDS, 15 * 24 * 60 * 60);

    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0]).toMatchObject({ externalOrderId: expect.stringContaining('MOCK-TOKOPEDIA') });
    expect(orders.every((o) => o.rawPayload && (o.rawPayload as { mock: boolean }).mock === true)).toBe(true);
  });
});

describe('3. Update order status', () => {
  it('updateOrderStatusOnPlatform menyimpan status terbaru, bisa dibaca balik lewat getMockOrderStatus()', async () => {
    expect(getMockOrderStatus('MOCK-TOKOPEDIA-001')).toBeUndefined();

    await tokopediaAdapter.updateOrderStatusOnPlatform!(CREDS, 'MOCK-TOKOPEDIA-001', 'shipped');

    expect(getMockOrderStatus('MOCK-TOKOPEDIA-001')).toBe('shipped');
  });
});

describe('4. Update stock (TEST 3 — task stock.updated)', () => {
  it('updateStockOnPlatform menyimpan stok terbaru, bisa dibaca balik lewat getMockStock()', async () => {
    expect(getMockStock('product-ayam-geprek')).toBeUndefined();

    await tokopediaAdapter.updateStockOnPlatform!(CREDS, 'product-ayam-geprek', 15);

    expect(getMockStock('product-ayam-geprek')).toBe(15);
  });
});
