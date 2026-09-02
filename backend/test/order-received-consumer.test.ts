// backend/test/order-received-consumer.test.ts

// STEP 4 — consumer readiness: EVENTS.ORDER_RECEIVED di sales-inventory.
//
// Sama pola dengan order-status-changed-consumer.test.ts (Step 5, sisi B):
// import modul untuk side-effect registrasi subscriber PRODUKSI asli
// (event-subscribers.ts, via sales-inventory/index.ts), lalu publish()
// ASLI dari event-bus.ts (TIDAK di-mock) seolah-olah dikirim Ecommerce
// Sync. Yang di-mock cuma auth-product/repository (DB), sama seperti
// tickets.test.ts sudah lakukan untuk endpoint ticket lainnya.
//
// Yang dibuktikan:
//  1. Subscriber produksi benar-benar menerima event.
//  2. Owner (bukan kasir/pengepak, bukan owner nonaktif) yang dikabari.
//  3. Event yang sama diterima dua kali TIDAK mengirim notifikasi dobel.
//  4. TIDAK ada ticket yang dibuat otomatis -- pembuatan ticket tetap
//     manual lewat Owner (SRS), event ini cuma notifikasi.

import { publish, EVENTS } from '../src/shared/event-bus';
import '../src/modules/sales-inventory'; // side-effect: registrasi subscriber produksi
import * as authRepo from '../src/modules/auth-product/repository';
import { findTicketByExternalOrderId } from '../src/modules/sales-inventory/repository';
import type { User, Notification } from '../src/modules/auth-product/repository';
import { describe, expect, it, jest, afterEach } from '@jest/globals';

jest.mock('../src/modules/auth-product/repository');

const mockedAuthRepo = authRepo as jest.Mocked<typeof authRepo>;

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Staf Uji',
    email_or_username: 'staf',
    password_hash: '$2a$10$tidakDipakaiLangsungDiTest.................',
    role: 'owner',
    phone: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    user_id: 'user-1',
    type: 'new_order',
    title: 'Order baru perlu ticket packing',
    message: null,
    reference_type: 'external_order',
    reference_id: 'order-uuid-1',
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Handler-nya async (listStaff + createNotification), publish() sendiri
// tidak menunggu listener async selesai (lihat event-bus.ts) -- kasih
// event loop kesempatan jalan dulu sebelum di-assert.
async function flushAsyncListeners(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('ORDER_RECEIVED consumer (sales-inventory/event-subscribers.ts, production, tidak di-mock)', () => {
  it('order baru -> Owner dikabari, kasir/pengepak TIDAK', async () => {
    const owner = buildUser({ id: 'owner-1', role: 'owner' });
    const kasir = buildUser({ id: 'kasir-1', role: 'kasir' });
    const pengepak = buildUser({ id: 'pengepak-1', role: 'pengepak' });
    mockedAuthRepo.listStaff.mockResolvedValue([owner, kasir, pengepak]);
    mockedAuthRepo.createNotification.mockResolvedValue(buildNotification());

    publish(EVENTS.ORDER_RECEIVED, {
      external_order_id: 'order-uuid-1',
      platform_id: 'platform-uuid-1',
      sla_type: 'instant',
    });

    await flushAsyncListeners();

    expect(mockedAuthRepo.createNotification).toHaveBeenCalledTimes(1);
    const [input] = mockedAuthRepo.createNotification.mock.calls[0];
    expect(input.user_id).toBe('owner-1');
    expect(input.reference_type).toBe('external_order');
    expect(input.reference_id).toBe('order-uuid-1');
  });

  it('owner yang sudah nonaktif TIDAK dikabari', async () => {
    const ownerNonaktif = buildUser({ id: 'owner-2', role: 'owner', is_active: false });
    mockedAuthRepo.listStaff.mockResolvedValue([ownerNonaktif]);

    publish(EVENTS.ORDER_RECEIVED, {
      external_order_id: 'order-uuid-2',
      platform_id: 'platform-uuid-1',
      sla_type: 'reguler',
    });

    await flushAsyncListeners();

    expect(mockedAuthRepo.createNotification).not.toHaveBeenCalled();
  });

  it('event yang sama diterima dua kali -> TIDAK mengirim notifikasi dobel', async () => {
    const owner = buildUser({ id: 'owner-3', role: 'owner' });
    mockedAuthRepo.listStaff.mockResolvedValue([owner]);
    mockedAuthRepo.createNotification.mockResolvedValue(buildNotification());

    const payload = {
      external_order_id: 'order-uuid-3',
      platform_id: 'platform-uuid-1',
      sla_type: 'same_day' as const,
    };

    publish(EVENTS.ORDER_RECEIVED, payload);
    await flushAsyncListeners();
    publish(EVENTS.ORDER_RECEIVED, payload);
    await flushAsyncListeners();

    expect(mockedAuthRepo.createNotification).toHaveBeenCalledTimes(1);
  });

  it('TIDAK membuat ticket apapun -- pembuatan ticket tetap manual lewat Owner', async () => {
    const owner = buildUser({ id: 'owner-5', role: 'owner' });
    mockedAuthRepo.listStaff.mockResolvedValue([owner]);
    mockedAuthRepo.createNotification.mockResolvedValue(buildNotification());

    publish(EVENTS.ORDER_RECEIVED, {
      external_order_id: 'order-uuid-5',
      platform_id: 'platform-uuid-1',
      sla_type: 'instant',
    });

    await flushAsyncListeners();

    const ticket = await findTicketByExternalOrderId('order-uuid-5');
    expect(ticket).toBeNull();
  });
});
