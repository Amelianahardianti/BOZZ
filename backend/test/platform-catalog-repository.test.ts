// backend/test/platform-catalog-repository.test.ts

// repo.listCatalogForPlatform() ASLI (bukan mock repository.ts sendiri,
// mock 1 layer di bawahnya: `prisma`) -- pola sama seperti
// customer-search-repository.test.ts. Membuktikan query Prisma yang
// sesungguhnya cuma menampilkan produk is_active=true dan platform yang
// benar-benar dikenal, bukan cuma diklaim di komentar kode.

import { describe, expect, it, jest, afterEach } from '@jest/globals';

interface FakeListingRow {
  platform_name: string;
  external_item_id: string;
  product: { name: string; price: string; stock_qty: number; is_active: boolean } | null;
}

let fixtures: FakeListingRow[] = [];
const PLATFORM_ID = 'platform-uuid-shopee';

jest.mock('../src/shared/db', () => ({
  prisma: {
    platforms: {
      findFirst: jest.fn(async ({ where }: { where: { platform_name: string } }) => {
        if (where.platform_name !== 'shopee') return null;
        return { id: PLATFORM_ID, platform_name: 'shopee' };
      }),
    },
    channel_listings: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { platform_id: string; products: { is_active: boolean } };
        }) => {
          return fixtures
            .filter((row) => row.platform_name === 'shopee' && where.platform_id === PLATFORM_ID)
            .filter((row) => row.product !== null && row.product.is_active === where.products.is_active)
            .map((row) => ({ external_item_id: row.external_item_id, products: row.product }));
        }
      ),
    },
  },
}));

// Import SETELAH jest.mock('../src/shared/db').
import * as repo from '../src/modules/ecommerce-sync/repository';

afterEach(() => {
  jest.clearAllMocks();
  fixtures = [];
});

describe('repo.listCatalogForPlatform — query Prisma asli (tidak di-mock)', () => {
  it('cuma menampilkan produk is_active=true, produk nonaktif TIDAK ikut', async () => {
    fixtures = [
      { platform_name: 'shopee', external_item_id: 'SHP-A', product: { name: 'Produk Aktif', price: '10000', stock_qty: 5, is_active: true } },
      { platform_name: 'shopee', external_item_id: 'SHP-B', product: { name: 'Produk Nonaktif', price: '20000', stock_qty: 5, is_active: false } },
    ];

    const result = await repo.listCatalogForPlatform('shopee');

    expect(result).toEqual([{ externalItemId: 'SHP-A', name: 'Produk Aktif', price: 10000, stock: 5 }]);
  });

  it('platform tidak dikenal -> array kosong, bukan error', async () => {
    const result = await repo.listCatalogForPlatform('platform-ngasal');
    expect(result).toEqual([]);
  });

  it('harga dikonversi ke number (bukan string Decimal Prisma)', async () => {
    fixtures = [
      { platform_name: 'shopee', external_item_id: 'SHP-C', product: { name: 'Produk C', price: '350000', stock_qty: 20, is_active: true } },
    ];

    const result = await repo.listCatalogForPlatform('shopee');

    expect(result[0].price).toBe(350000);
    expect(typeof result[0].price).toBe('number');
  });
});
