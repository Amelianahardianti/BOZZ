// backend/test/platform-public-list.test.ts

// GET /api/platforms/public — External E-commerce Order Simulator
// (requirement §5/§16/§19). Publik, cuma platform yang punya >=1 produk
// mapped yang muncul (bukan semua platform terdaftar registry).

import { describe, expect, it, jest, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app';
import * as repo from '../src/modules/ecommerce-sync/repository';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/platforms/public', () => {
  it('TANPA Authorization header -> tetap 200 (simulator tidak perlu login)', async () => {
    mockedRepo.listCatalogForPlatform.mockResolvedValue([]);

    const res = await request(app).get('/api/platforms/public');

    expect(res.status).toBe(200);
  });

  it('cuma platform yang punya minimal 1 produk mapped yang muncul', async () => {
    mockedRepo.listCatalogForPlatform.mockImplementation(async (platformName: string) => {
      if (platformName === 'shopee' || platformName === 'tokopedia') {
        return [{ externalItemId: 'X-1', name: 'Produk', price: 1000, stock: 1 }];
      }
      return []; // tiktok & fakestore belum ada mapping di skenario ini
    });

    const res = await request(app).get('/api/platforms/public');

    expect(res.status).toBe(200);
    const names = (res.body as { platform_name: string }[]).map((p) => p.platform_name).sort();
    expect(names).toEqual(['shopee', 'tokopedia']);
  });

  it('response cuma berisi platform_name, bukan detail koneksi/shop_id_external', async () => {
    mockedRepo.listCatalogForPlatform.mockResolvedValue([
      { externalItemId: 'X-1', name: 'Produk', price: 1000, stock: 1 },
    ]);

    const res = await request(app).get('/api/platforms/public');

    for (const row of res.body) {
      expect(Object.keys(row)).toEqual(['platform_name']);
    }
  });
});
