// backend/test/mock-adapter.test.ts

// createMockAdapter() (adapters/mock.adapter.ts) — belum ada test sama
// sekali sebelumnya walau dipakai Shopee Mock & TikTok Mock (MOCK_SHOPEE/
// MOCK_TIKTOK=true di .env). Fungsi ASLI diuji langsung (bukan lewat
// registry/HTTP), repository.ts di-mock supaya exchangeCodeForToken tidak
// butuh DB asli.
//
// TEST 2 (task stock.updated): membuktikan Shopee Mock (instance
// createMockAdapter('shopee', ...)) benar-benar MENYIMPAN stok baru,
// bukan cuma menerima panggilan -- dibuktikan lewat getMockStock(), bukan
// cuma assert mock terpanggil.

import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { createMockAdapter } from '../src/modules/ecommerce-sync/adapters/mock.adapter';
import * as repo from '../src/modules/ecommerce-sync/repository';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('createMockAdapter — updateStockOnPlatform (dipakai Shopee Mock & TikTok Mock)', () => {
  it('TEST 2 — stok tersimpan dan bisa dibaca balik lewat getMockStock() (state beneran berubah, bukan cuma dipanggil)', async () => {
    const shopeeMock = createMockAdapter('shopee', 'http://localhost:3000/callback');
    const creds = { shopIdExternal: 'MOCK-SHOP-SHOPEE', accessToken: 'mock-access-token' };

    expect(shopeeMock.getMockStock('product-ayam-geprek')).toBeUndefined();

    await shopeeMock.updateStockOnPlatform!(creds, 'product-ayam-geprek', 15);

    expect(shopeeMock.getMockStock('product-ayam-geprek')).toBe(15);
  });

  it('update kedua untuk produk yang sama menimpa nilai lama (state terkini, bukan riwayat)', async () => {
    const shopeeMock = createMockAdapter('shopee', 'http://localhost:3000/callback');
    const creds = { shopIdExternal: 'MOCK-SHOP-SHOPEE', accessToken: 'mock-access-token' };

    await shopeeMock.updateStockOnPlatform!(creds, 'product-x', 20);
    await shopeeMock.updateStockOnPlatform!(creds, 'product-x', 15);

    expect(shopeeMock.getMockStock('product-x')).toBe(15);
  });

  it('dua instance adapter (mis. Shopee Mock & TikTok Mock) punya state stok yang TERPISAH', async () => {
    const shopeeMock = createMockAdapter('shopee', 'http://localhost:3000/callback');
    const tiktokMock = createMockAdapter('tiktok', 'http://localhost:3000/callback');
    const creds = { shopIdExternal: 'x', accessToken: 'y' };

    await shopeeMock.updateStockOnPlatform!(creds, 'product-x', 15);

    expect(shopeeMock.getMockStock('product-x')).toBe(15);
    expect(tiktokMock.getMockStock('product-x')).toBeUndefined();
  });

  it('connect (exchangeCodeForToken) tetap berfungsi seperti sebelumnya -- perubahan ini tidak merusak fitur existing', async () => {
    const shopeeMock = createMockAdapter('shopee', 'http://localhost:3000/callback');
    mockedRepo.upsertPlatformToken.mockResolvedValue({} as Awaited<ReturnType<typeof repo.upsertPlatformToken>>);

    const result = await shopeeMock.exchangeCodeForToken('MOCK_CODE');

    expect(mockedRepo.upsertPlatformToken).toHaveBeenCalledWith(
      'shopee',
      expect.objectContaining({ accessToken: 'mock-access-token' })
    );
    expect(result.shopIdExternal).toBe('MOCK-SHOP-SHOPEE');
  });
});
