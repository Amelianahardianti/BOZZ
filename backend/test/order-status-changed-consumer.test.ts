// backend/test/order-status-changed-consumer.test.ts

// STEP 5 (sisi B) — Reverse Flow consumer readiness: ORDER_STATUS_CHANGED.
//
// Membuktikan consumer PRODUCTION di ecommerce-sync/service.ts sudah siap
// menerima event ini dari modul LAIN (mis. Sales & Inventory / Orang A),
// bukan cuma dari jalur manual milik ecommerce-sync sendiri
// (updateOrderStatus -> publish, lihat order-ingestion.test.ts dkk yang
// TIDAK menguji jalur ini).
//
// Cara membuktikannya TANPA fake subscriber buatan sendiri: import
// service.ts (memicu side-effect subscribe(EVENTS.ORDER_STATUS_CHANGED,
// ...) di service.ts:260 -- kode produksi asli, bukan re-implementasi di
// test), lalu publish() ASLI dari event-bus.ts (TIDAK di-mock, sama pola
// dengan order-ingestion.test.ts) seolah-olah dikirim modul lain.
// repository.ts & adapters/registry.ts di-mock supaya tidak ada network
// request/DB asli -- termasuk TIDAK ada panggilan ke FakeStoreAPI
// sungguhan (adapter di sini adalah fake object, updateOrderStatusOnPlatform
// cuma jest.fn()).
//
// PENTING soal event-bus: subscribe() di service.ts:260 cuma terdaftar
// SEKALI saat modul di-import (module registry Jest per test FILE, bukan
// per `it()`). Makanya afterEach() di bawah SENGAJA TIDAK memanggil
// resetEventBus() -- itu akan mencabut subscriber produksi yang sedang
// diuji dan bikin test berikutnya di file ini gagal karena listener-nya
// hilang. Yang direset cuma mock repo/adapter (jest.resetAllMocks()).

import { publish, EVENTS } from '../src/shared/event-bus';
import '../src/modules/ecommerce-sync/service'; // side-effect: registrasi subscriber produksi
import * as repo from '../src/modules/ecommerce-sync/repository';
import * as registry from '../src/modules/ecommerce-sync/adapters/registry';
import type { PlatformCredentials } from '../src/modules/ecommerce-sync/types';
import { describe, expect, it, jest, afterEach } from '@jest/globals';

jest.mock('../src/modules/ecommerce-sync/repository');

jest.mock('../src/modules/ecommerce-sync/adapters/registry', () => ({
  getAdapter: jest.fn(),
  isPlatformConfigured: jest.fn(),
  platformAdapters: {
    fakestore: {
      name: 'fakestore',
      buildAuthorizationUrl: jest.fn(),
      exchangeCodeForToken: jest.fn(),
      getValidAccessToken: jest
        .fn<() => Promise<PlatformCredentials>>()
        .mockResolvedValue({ shopIdExternal: 'fakestore-demo-shop', accessToken: 'no-auth-needed' }),
      fetchRecentOrders: jest.fn(),
      // Fake object -- BUKAN FakeStoreAPI sungguhan, tidak ada network request.
      updateOrderStatusOnPlatform: jest
        .fn<(creds: PlatformCredentials, externalOrderId: string, status: string) => Promise<void>>()
        .mockResolvedValue(undefined),
    },
  },
}));

const mockedRepo = repo as jest.Mocked<typeof repo>;
const fakestoreAdapterMock = registry.platformAdapters.fakestore as unknown as {
  getValidAccessToken: jest.Mock;
  updateOrderStatusOnPlatform: jest.Mock;
};

// Jest butuh sedikit waktu event-loop untuk membiarkan handler ASYNC di
// dalam subscribe() (service.ts:260) selesai jalan sebelum di-assert --
// publish() sendiri tidak menunggu listener async (lihat komentar di
// event-bus.ts publish()).
async function flushAsyncListeners(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

afterEach(() => {
  jest.clearAllMocks(); // BUKAN resetEventBus() -- lihat catatan di header file.
});

describe('ORDER_STATUS_CHANGED consumer (service.ts:260, production, tidak di-mock)', () => {
  it('event dari modul lain -> subscriber ditemukan order & platform-nya, lalu forward ke adapter dengan external order ID + status yang benar', async () => {
    mockedRepo.getExternalOrderDetailRow.mockResolvedValue({
      id: 'order-uuid-1',
      platform_id: 'platform-uuid-fakestore',
      external_order_id: 'CART-123',
    } as Awaited<ReturnType<typeof repo.getExternalOrderDetailRow>>);

    mockedRepo.findPlatformById.mockResolvedValue({
      id: 'platform-uuid-fakestore',
      platform_name: 'fakestore',
    } as Awaited<ReturnType<typeof repo.findPlatformById>>);

    // Payload PERSIS seperti yang disebut skenario Orang A -- external_order_id
    // di sini adalah UUID baris internal `external_orders`, bukan kode
    // marketplace mentah (lihat audit Step 4 soal kontrak payload ini).
    publish(EVENTS.ORDER_STATUS_CHANGED, {
      external_order_id: 'order-uuid-1',
      new_status: 'completed',
    });

    await flushAsyncListeners();

    // 3. Order & platform ditemukan lewat mekanisme production yang ada
    //    (repo.getExternalOrderDetailRow + repo.findPlatformById), bukan
    //    jalan pintas buatan test.
    expect(mockedRepo.getExternalOrderDetailRow).toHaveBeenCalledWith('order-uuid-1');
    expect(mockedRepo.findPlatformById).toHaveBeenCalledWith('platform-uuid-fakestore');

    // 4. Adapter platform (di sini: fakestore) dipanggil dengan external
    //    order ID + status yang benar.
    expect(fakestoreAdapterMock.getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(fakestoreAdapterMock.updateOrderStatusOnPlatform).toHaveBeenCalledWith(
      { shopIdExternal: 'fakestore-demo-shop', accessToken: 'no-auth-needed' },
      'CART-123',
      'completed'
    );
  });

  it('order tidak ditemukan -> forward TIDAK dijalankan (guard produksi asli, bukan cuma happy path)', async () => {
    mockedRepo.getExternalOrderDetailRow.mockResolvedValue(null);

    publish(EVENTS.ORDER_STATUS_CHANGED, {
      external_order_id: 'order-tidak-ada',
      new_status: 'completed',
    });

    await flushAsyncListeners();

    expect(mockedRepo.getExternalOrderDetailRow).toHaveBeenCalledWith('order-tidak-ada');
    expect(mockedRepo.findPlatformById).not.toHaveBeenCalled();
    expect(fakestoreAdapterMock.updateOrderStatusOnPlatform).not.toHaveBeenCalled();
  });

  it('platform row tidak ditemukan -> adapter TIDAK dipanggil', async () => {
    mockedRepo.getExternalOrderDetailRow.mockResolvedValue({
      id: 'order-uuid-2',
      platform_id: 'platform-uuid-tidak-ada',
      external_order_id: 'CART-999',
    } as Awaited<ReturnType<typeof repo.getExternalOrderDetailRow>>);
    mockedRepo.findPlatformById.mockResolvedValue(null);

    publish(EVENTS.ORDER_STATUS_CHANGED, {
      external_order_id: 'order-uuid-2',
      new_status: 'completed',
    });

    await flushAsyncListeners();

    expect(mockedRepo.findPlatformById).toHaveBeenCalledWith('platform-uuid-tidak-ada');
    expect(fakestoreAdapterMock.updateOrderStatusOnPlatform).not.toHaveBeenCalled();
  });
});
