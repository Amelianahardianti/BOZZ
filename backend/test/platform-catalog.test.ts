// backend/test/platform-catalog.test.ts

// GET /api/platforms/:platform/catalog — External E-commerce Order
// Simulator (requirement §19). Endpoint publik (TANPA JWT) yang
// menampilkan katalog produk BOZZ yang punya mapping valid ke satu
// platform. Pola sama seperti orders.test.ts/customer-crm.test.ts
// (repository.ts di-mock, supertest ke `app` asli) -- bedanya endpoint
// ini SENGAJA tidak requireAuth, jadi test-nya justru membuktikan bisa
// dipanggil TANPA Authorization header sama sekali.

import { describe, expect, it, jest, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app';
import * as repo from '../src/modules/ecommerce-sync/repository';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/platforms/:platform/catalog', () => {
  it('TANPA Authorization header sama sekali -> tetap 200 (endpoint publik, simulator tidak perlu login BOZZ)', async () => {
    mockedRepo.listCatalogForPlatform.mockResolvedValue([
      { externalItemId: 'SHP-BOZZ-BAG-001', name: 'Fjallraven Backpack', price: 350000, stock: 20 },
    ]);

    const res = await request(app).get('/api/platforms/shopee/catalog');

    expect(res.status).toBe(200);
    expect(mockedRepo.listCatalogForPlatform).toHaveBeenCalledWith('shopee');
    expect(res.body).toEqual([{ externalItemId: 'SHP-BOZZ-BAG-001', name: 'Fjallraven Backpack', price: 350000, stock: 20 }]);
  });

  it('respons TIDAK berisi field internal product_id apa pun -- cuma externalItemId, name, price, stock', async () => {
    mockedRepo.listCatalogForPlatform.mockResolvedValue([
      { externalItemId: 'TKP-BOZZ-SHIRT-001', name: 'Mens Premium T-Shirt', price: 120000, stock: 29 },
    ]);

    const res = await request(app).get('/api/platforms/tokopedia/catalog');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body[0]).sort()).toEqual(['externalItemId', 'name', 'price', 'stock'].sort());
  });

  it('platform tidak dikenal registry -> 404 (bukan array kosong diam-diam)', async () => {
    const res = await request(app).get('/api/platforms/platform-ngasal/catalog');

    expect(res.status).toBe(404);
    expect(mockedRepo.listCatalogForPlatform).not.toHaveBeenCalled();
  });

  it('platform dikenal tapi belum ada mapping sama sekali -> 200 + array kosong (bukan error)', async () => {
    mockedRepo.listCatalogForPlatform.mockResolvedValue([]);

    const res = await request(app).get('/api/platforms/tiktok/catalog');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
