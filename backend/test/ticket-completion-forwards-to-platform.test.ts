// backend/test/ticket-completion-forwards-to-platform.test.ts

// STEP 5 — bukti integrasi NYATA A -> B, bukan simulasi terpisah.
//
// Test lain yang sudah ada menguji tiap sisi secara ISOLASI:
//  - tickets.test.ts (A): membuktikan updateTicketProgress() mem-publish
//    ORDER_STATUS_CHANGED lewat listener dummy yang ditangkap test itu
//    sendiri -- TIDAK pernah memastikan B beneran menerimanya.
//  - order-status-changed-consumer.test.ts (B): membuktikan subscriber B
//    bereaksi benar -- tapi event-nya di-publish MANUAL oleh test itu
//    sendiri, bukan lewat A yang sungguhan.
//
// Test ini menyalakan APLIKASI ASLI (`app` dari src/app.ts, sama seperti
// tickets.test.ts) supaya KEDUA modul (sales-inventory & ecommerce-sync)
// ter-load bersamaan di proses yang sama -- subscriber produksi A
// (publish) dan B (subscribe -> forwardStatusToPlatform) aktif berbarengan
// di event bus SINGLETON yang sama, TANPA simulasi apapun di tengah.
//
// Alur yang benar-benar dijalankan lewat HTTP asli:
//   POST /api/tickets (Owner bikin ticket 1 item, assign ke Pengepak)
//   -> PATCH /api/tickets/:id/status (Pengepak centang item terakhir)
//   -> [PRODUKSI] service.ts A: publish(ORDER_STATUS_CHANGED)
//   -> [PRODUKSI] service.ts B: subscriber -> forwardStatusToPlatform()
//   -> adapter platform (di-mock di titik HTTP terluar -- fetch ke
//      FakeStoreAPI asli -- BUKAN internal repository/event bus)
//
// Yang di-mock: auth-product/repository (DB akun, sama seperti
// tickets.test.ts), ecommerce-sync/repository (DB order/platform), dan
// adapter registry ecommerce-sync (supaya TIDAK ada network request asli
// ke fakestoreapi.com). Event bus dan kedua service.ts produksi TIDAK
// di-mock sama sekali.

import { randomUUID } from 'crypto';
import request from 'supertest';
import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { app } from '../src/app';
import * as authRepo from '../src/modules/auth-product/repository';
import type { User } from '../src/modules/auth-product/repository';
import * as ecommerceRepo from '../src/modules/ecommerce-sync/repository';
import * as registry from '../src/modules/ecommerce-sync/adapters/registry';
import type { PlatformCredentials } from '../src/modules/ecommerce-sync/types';
import { ownerToken, tokenFor } from './helpers/auth';

jest.mock('../src/modules/auth-product/repository');
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

const mockedAuthRepo = authRepo as jest.Mocked<typeof authRepo>;
const mockedEcommerceRepo = ecommerceRepo as jest.Mocked<typeof ecommerceRepo>;
const fakestoreAdapterMock = registry.platformAdapters.fakestore as unknown as {
  updateOrderStatusOnPlatform: jest.Mock;
};

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Staf Uji',
    email_or_username: 'staf',
    password_hash: '$2a$10$tidakDipakaiLangsungDiTest.................',
    role: 'pengepak',
    phone: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

async function flushAsyncListeners(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('Ticket handed_over -> A publish -> B forward -> adapter (integrasi lintas modul, produksi asli)', () => {
  it('centang item terakhir ticket -> B benar-benar forward ke adapter platform dengan external order id + status yang benar', async () => {
    const owner = ownerToken();
    const pengepakId = `pengepak-${randomUUID().slice(0, 8)}`;
    const pengepak = buildUser({ id: pengepakId, role: 'pengepak' });
    mockedAuthRepo.findById.mockImplementation(async (id: string) =>
      id === pengepakId ? pengepak : null
    );

    // Order internal (UUID `external_orders.id`) -- ini yang dipakai sebagai
    // `external_order_id` di ticket & di payload ORDER_STATUS_CHANGED,
    // BUKAN kode marketplace mentah (lihat audit Step 4/5 sebelumnya).
    const internalOrderId = randomUUID();
    mockedEcommerceRepo.getExternalOrderDetailRow.mockResolvedValue({
      id: internalOrderId,
      platform_id: 'platform-uuid-fakestore',
      external_order_id: 'CART-999', // kode marketplace ASLI, beda dari internalOrderId
    } as Awaited<ReturnType<typeof ecommerceRepo.getExternalOrderDetailRow>>);
    mockedEcommerceRepo.findPlatformById.mockResolvedValue({
      id: 'platform-uuid-fakestore',
      platform_name: 'fakestore',
    } as Awaited<ReturnType<typeof ecommerceRepo.findPlatformById>>);

    const produk = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${owner}`)
      .send({ name: `Produk Integrasi ${randomUUID()}`, price: 10000, stock_qty: 20 });
    expect(produk.status).toBe(201);

    const ticket = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${owner}`)
      .send({
        external_order_id: internalOrderId,
        assigned_to_user_id: pengepakId,
        items: [{ product_id: produk.body.id, qty: 1 }],
      });
    expect(ticket.status).toBe(201);
    expect(ticket.body.items).toHaveLength(1);

    // Pengepak mencentang satu-satunya item -> ini "handed_over" secara
    // efektif (semua item selesai), memicu publish ORDER_STATUS_CHANGED
    // di service.ts A yang SUNGGUHAN.
    const update = await request(app)
      .patch(`/api/tickets/${ticket.body.id}/status`)
      .set('Authorization', `Bearer ${tokenFor('pengepak', pengepakId)}`)
      .send({ ticket_items: [{ id: ticket.body.items[0].id, is_packed: true }] });
    expect(update.status).toBe(200);

    await flushAsyncListeners();

    // Bukti B beneran menerima & memproses: repo B (mock) dipanggil dengan
    // ID order yang PERSIS dikirim A lewat event.
    expect(mockedEcommerceRepo.getExternalOrderDetailRow).toHaveBeenCalledWith(internalOrderId);
    expect(mockedEcommerceRepo.findPlatformById).toHaveBeenCalledWith('platform-uuid-fakestore');

    // Bukti akhir: adapter FakeStore dipanggil dengan external order id
    // MARKETPLACE ASLI ('CART-999', bukan internalOrderId) + status yang
    // dikirim A ('processing', lihat STATUS_ORDER_SAAT_PACKING_SELESAI).
    expect(fakestoreAdapterMock.updateOrderStatusOnPlatform).toHaveBeenCalledWith(
      { shopIdExternal: 'fakestore-demo-shop', accessToken: 'no-auth-needed' },
      'CART-999',
      'processing'
    );
  });
});
