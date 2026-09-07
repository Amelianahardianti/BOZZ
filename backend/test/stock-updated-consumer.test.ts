// backend/test/stock-updated-consumer.test.ts

// stock.updated consumer (SRS §8.2) — modul ecommerce-sync / Order Hub.
//
// Membuktikan subscriber PRODUKSI di service.ts (bukan tiruan di test)
// benar-benar menerima event.stock.updated dari Sales & Inventory dan
// meneruskannya ke SEMUA platform yang is_connected=true lewat
// adapter.updateStockOnPlatform() -- pola sama persis dengan
// order-status-changed-consumer.test.ts: import service.ts untuk
// side-effect registrasi subscriber, publish() ASLI dari event-bus.ts
// (tidak di-mock), repository.ts & adapters/registry di-mock supaya
// deterministik dan tidak butuh DB/network asli.
//
// Adapter Shopee/Tokopedia yang SESUNGGUHNYA (createMockAdapter,
// tokopediaAdapter) diuji terpisah di test/mock-adapters-stock.test.ts --
// file ini fokus ke WIRING & RESILIENCE (siapa dipanggil, siapa
// dilewati, kegagalan 1 platform tidak menghentikan yang lain).

import { publish, EVENTS } from '../src/shared/event-bus';
import '../src/modules/ecommerce-sync/service'; // side-effect: registrasi subscriber produksi
import * as repo from '../src/modules/ecommerce-sync/repository';
import * as registry from '../src/modules/ecommerce-sync/adapters/registry';
import type { PlatformAdapter, PlatformCredentials } from '../src/modules/ecommerce-sync/types';
import { describe, expect, it, jest, afterEach } from '@jest/globals';

jest.mock('../src/modules/ecommerce-sync/repository');

jest.mock('../src/modules/ecommerce-sync/adapters/registry', () => ({
  getAdapter: jest.fn(),
  isPlatformConfigured: jest.fn(),
  platformAdapters: {
    shopee: {
      name: 'shopee',
      buildAuthorizationUrl: jest.fn(),
      exchangeCodeForToken: jest.fn(),
      getValidAccessToken: jest
        .fn<() => Promise<PlatformCredentials>>()
        .mockResolvedValue({ shopIdExternal: 'shop-shopee', accessToken: 'tok-shopee' }),
      fetchRecentOrders: jest.fn(),
      updateStockOnPlatform: jest
        .fn<(creds: PlatformCredentials, productId: string, stockAfter: number) => Promise<void>>()
        .mockResolvedValue(undefined),
    },
    tokopedia: {
      name: 'tokopedia',
      buildAuthorizationUrl: jest.fn(),
      exchangeCodeForToken: jest.fn(),
      getValidAccessToken: jest
        .fn<() => Promise<PlatformCredentials>>()
        .mockResolvedValue({ shopIdExternal: 'shop-tokopedia', accessToken: 'tok-tokopedia' }),
      fetchRecentOrders: jest.fn(),
      updateStockOnPlatform: jest
        .fn<(creds: PlatformCredentials, productId: string, stockAfter: number) => Promise<void>>()
        .mockResolvedValue(undefined),
    },
    // Sengaja TIDAK ada updateStockOnPlatform -- membuktikan platform yang
    // belum dukung sync stok dilewati dengan aman, bukan bikin crash.
    fakestore: {
      name: 'fakestore',
      buildAuthorizationUrl: jest.fn(),
      exchangeCodeForToken: jest.fn(),
      getValidAccessToken: jest.fn<() => Promise<PlatformCredentials>>(),
      fetchRecentOrders: jest.fn(),
    },
  },
}));

const mockedRepo = repo as jest.Mocked<typeof repo>;
const adapters = registry.platformAdapters as unknown as Record<
  string,
  PlatformAdapter & { updateStockOnPlatform?: jest.MockedFunction<NonNullable<PlatformAdapter['updateStockOnPlatform']>> }
>;

type PlatformRow = Awaited<ReturnType<typeof repo.listPlatformRows>>[number];

function buildPlatformRow(overrides: Partial<PlatformRow> = {}): PlatformRow {
  return {
    id: `platform-${overrides.platform_name ?? 'x'}`,
    platform_name: 'shopee',
    shop_id_external: null,
    token_expires_at: null,
    is_connected: true,
    last_synced_at: null,
    last_sync_status: null,
    ...overrides,
  } as PlatformRow;
}

async function flushAsync(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('EVENTS.STOCK_UPDATED consumer (service.ts, production, tidak di-mock)', () => {
  it('TEST 1 — platform terhubung menerima event, adapter.updateStockOnPlatform dipanggil dengan product_id & stock_after yang benar', async () => {
    mockedRepo.listPlatformRows.mockResolvedValue([buildPlatformRow({ platform_name: 'shopee', is_connected: true })]);

    publish(EVENTS.STOCK_UPDATED, {
      product_id: 'product-ayam-geprek',
      stock_after: 15,
      reason: 'sale',
    });

    await flushAsync();

    expect(adapters.shopee.updateStockOnPlatform).toHaveBeenCalledWith(
      { shopIdExternal: 'shop-shopee', accessToken: 'tok-shopee' },
      'product-ayam-geprek',
      15
    );
  });

  it('TEST 2 (bagian wiring) — Shopee Mock terhubung -> menerima update', async () => {
    mockedRepo.listPlatformRows.mockResolvedValue([buildPlatformRow({ platform_name: 'shopee', is_connected: true })]);

    publish(EVENTS.STOCK_UPDATED, { product_id: 'product-a', stock_after: 8, reason: 'manual_adjustment' });
    await flushAsync();

    expect(adapters.shopee.updateStockOnPlatform).toHaveBeenCalledTimes(1);
  });

  it('TEST 3 (bagian wiring) — Tokopedia Mock terhubung -> menerima update', async () => {
    mockedRepo.listPlatformRows.mockResolvedValue([buildPlatformRow({ platform_name: 'tokopedia', is_connected: true })]);

    publish(EVENTS.STOCK_UPDATED, { product_id: 'product-a', stock_after: 8, reason: 'manual_adjustment' });
    await flushAsync();

    expect(adapters.tokopedia.updateStockOnPlatform).toHaveBeenCalledTimes(1);
    expect(adapters.shopee.updateStockOnPlatform).not.toHaveBeenCalled();
  });

  it('TEST 4 — Shopee Mock DAN Tokopedia Mock sama-sama terhubung -> KEDUANYA menerima update', async () => {
    mockedRepo.listPlatformRows.mockResolvedValue([
      buildPlatformRow({ platform_name: 'shopee', is_connected: true }),
      buildPlatformRow({ platform_name: 'tokopedia', is_connected: true }),
    ]);

    publish(EVENTS.STOCK_UPDATED, { product_id: 'product-multi', stock_after: 42, reason: 'restock' });
    await flushAsync();

    expect(adapters.shopee.updateStockOnPlatform).toHaveBeenCalledWith(expect.anything(), 'product-multi', 42);
    expect(adapters.tokopedia.updateStockOnPlatform).toHaveBeenCalledWith(expect.anything(), 'product-multi', 42);
  });

  it('TEST 5 — Shopee Mock gagal update -> Tokopedia Mock TETAP menerima update (kegagalan 1 platform tidak menghentikan yang lain)', async () => {
    // "Shopee API down" SENGAJA dipicu -- pushStockToConnectedPlatforms
    // memang mencatatnya lewat console.error (service.ts) sebelum lanjut
    // ke platform berikutnya. Di-spy lokal cuma buat test ini.
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    adapters.shopee.updateStockOnPlatform!.mockRejectedValueOnce(new Error('Shopee API down'));
    mockedRepo.listPlatformRows.mockResolvedValue([
      buildPlatformRow({ platform_name: 'shopee', is_connected: true }),
      buildPlatformRow({ platform_name: 'tokopedia', is_connected: true }),
    ]);

    publish(EVENTS.STOCK_UPDATED, { product_id: 'product-b', stock_after: 3, reason: 'sale' });
    await flushAsync();

    expect(adapters.shopee.updateStockOnPlatform).toHaveBeenCalledTimes(1);
    expect(adapters.tokopedia.updateStockOnPlatform).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ecommerce-sync] gagal update stok ke shopee'),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('platform belum connect (is_connected=false) -> TIDAK dipanggil', async () => {
    mockedRepo.listPlatformRows.mockResolvedValue([buildPlatformRow({ platform_name: 'shopee', is_connected: false })]);

    publish(EVENTS.STOCK_UPDATED, { product_id: 'product-c', stock_after: 1, reason: 'sale' });
    await flushAsync();

    expect(adapters.shopee.updateStockOnPlatform).not.toHaveBeenCalled();
  });

  it('platform terhubung tapi adapter belum dukung updateStockOnPlatform (FakeStore) -> dilewati, tidak crash', async () => {
    mockedRepo.listPlatformRows.mockResolvedValue([buildPlatformRow({ platform_name: 'fakestore', is_connected: true })]);

    await expect(async () => {
      publish(EVENTS.STOCK_UPDATED, { product_id: 'product-d', stock_after: 5, reason: 'sale' });
      await flushAsync();
    }).not.toThrow();
  });
});
