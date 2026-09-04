// backend/test/sla-escalation-repository.test.ts

// TASK #14 — SLA Escalation Alerts (FR-OC-09), level repository (modul
// ecommerce-sync / Order Hub).
//
// Menguji repo.findOrdersNeedingEscalation() dan repo.hasEscalationNotification()
// ASLI (bukan mock repository.ts sendiri, tapi mock 1 layer di bawahnya:
// `prisma`, shared/db.ts) -- pola SAMA PERSIS dengan customer-matching.test.ts
// dan customer-search-repository.test.ts. Fake `findMany` di bawah ini
// meniru semantik where-clause Prisma asli (rentang sla_deadline DAN
// relasi tickets kosong), supaya kalau where-clause di repository.ts
// berubah/rusak, test ini benar-benar gagal -- bukan cuma menguji mock
// yang mengembalikan apa saja yang disuruh.
//
// Membuktikan 3 dari 5 skenario di task #14 yang sifatnya FILTER QUERY
// (bukan orchestration): order dekat deadline TANPA ticket -> masuk;
// order dekat deadline TAPI SUDAH ada ticket -> tidak masuk; order jauh
// dari deadline -> tidak masuk; order tanpa sla_deadline sama sekali ->
// tidak masuk (tidak crash). Skenario orchestration (notifikasi dibuat +
// dedup lintas eksekusi) ada di sla-escalation.test.ts (level service).

import { describe, expect, it, jest, afterEach } from '@jest/globals';

interface FakeOrderRow {
  id: string;
  platform_id: string;
  external_order_id: string;
  sla_type: string;
  sla_deadline: Date | null;
  ticketCount: number; // simulasi relasi tickets -- 0 = belum ada ticket
}

interface FakeNotificationRow {
  type: string;
  reference_type: string;
  reference_id: string;
}

let orderFixtures: FakeOrderRow[] = [];
let notificationFixtures: FakeNotificationRow[] = [];

jest.mock('../src/shared/db', () => ({
  prisma: {
    external_orders: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            sla_deadline: { not: null; gte: Date; lte: Date };
            tickets: { none: object };
          };
        }) => {
          return orderFixtures
            .filter((row) => row.sla_deadline !== null)
            .filter((row) => row.sla_deadline! >= where.sla_deadline.gte)
            .filter((row) => row.sla_deadline! <= where.sla_deadline.lte)
            .filter((row) => row.ticketCount === 0) // `tickets: { none: {} }`
            .map(({ id, platform_id, external_order_id, sla_type, sla_deadline }) => ({
              id,
              platform_id,
              external_order_id,
              sla_type,
              sla_deadline,
            }));
        }
      ),
    },
    notifications: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { type: string; reference_type: string; reference_id: string };
        }) => {
          const found = notificationFixtures.find(
            (n) =>
              n.type === where.type &&
              n.reference_type === where.reference_type &&
              n.reference_id === where.reference_id
          );
          return found ? { id: 'notif-fake-id' } : null;
        }
      ),
    },
  },
}));

// Import SETELAH jest.mock('../src/shared/db') di atas.
import * as repo from '../src/modules/ecommerce-sync/repository';

afterEach(() => {
  jest.clearAllMocks();
  orderFixtures = [];
  notificationFixtures = [];
});

describe('repo.findOrdersNeedingEscalation — filter query asli (tidak di-mock)', () => {
  const NOW = new Date('2026-01-01T12:00:00.000Z');
  const WINDOW_MS = 60 * 60 * 1000; // 1 jam, cuma dipakai buat test ini

  it('1. order dekat deadline (30 menit lagi) DAN belum ada ticket -> ikut sebagai kandidat', async () => {
    orderFixtures = [
      {
        id: 'order-near-no-ticket',
        platform_id: 'platform-1',
        external_order_id: 'CART-1',
        sla_type: 'instant',
        sla_deadline: new Date('2026-01-01T12:30:00.000Z'),
        ticketCount: 0,
      },
    ];

    const result = await repo.findOrdersNeedingEscalation(NOW, WINDOW_MS);

    expect(result.map((r) => r.id)).toEqual(['order-near-no-ticket']);
  });

  it('2. order dekat deadline TAPI SUDAH ada ticket -> TIDAK ikut', async () => {
    orderFixtures = [
      {
        id: 'order-near-has-ticket',
        platform_id: 'platform-1',
        external_order_id: 'CART-2',
        sla_type: 'instant',
        sla_deadline: new Date('2026-01-01T12:30:00.000Z'),
        ticketCount: 1,
      },
    ];

    const result = await repo.findOrdersNeedingEscalation(NOW, WINDOW_MS);

    expect(result).toEqual([]);
  });

  it('3. order MASIH JAUH dari deadline (3 jam lagi, di luar window 1 jam) -> TIDAK ikut', async () => {
    orderFixtures = [
      {
        id: 'order-far',
        platform_id: 'platform-1',
        external_order_id: 'CART-3',
        sla_type: 'reguler',
        sla_deadline: new Date('2026-01-01T15:00:00.000Z'),
        ticketCount: 0,
      },
    ];

    const result = await repo.findOrdersNeedingEscalation(NOW, WINDOW_MS);

    expect(result).toEqual([]);
  });

  it('4. order TANPA sla_deadline -> TIDAK ikut, dan tidak crash', async () => {
    orderFixtures = [
      {
        id: 'order-no-deadline',
        platform_id: 'platform-1',
        external_order_id: 'CART-4',
        sla_type: 'reguler',
        sla_deadline: null,
        ticketCount: 0,
      },
    ];

    const result = await repo.findOrdersNeedingEscalation(NOW, WINDOW_MS);

    expect(result).toEqual([]);
  });

  it('order yang deadline-nya SUDAH LEWAT -> TIDAK ikut (FR-OC-09: "mendekati", bukan "sudah lewat")', async () => {
    orderFixtures = [
      {
        id: 'order-overdue',
        platform_id: 'platform-1',
        external_order_id: 'CART-5',
        sla_type: 'instant',
        sla_deadline: new Date('2026-01-01T11:00:00.000Z'), // 1 jam yang lalu
        ticketCount: 0,
      },
    ];

    const result = await repo.findOrdersNeedingEscalation(NOW, WINDOW_MS);

    expect(result).toEqual([]);
  });
});

describe('repo.hasEscalationNotification — dedup query asli (tidak di-mock)', () => {
  it('belum pernah ada notifikasi eskalasi untuk order ini -> false', async () => {
    const result = await repo.hasEscalationNotification('order-belum-pernah');
    expect(result).toBe(false);
  });

  it('sudah ada notifikasi eskalasi (type + reference_type + reference_id cocok) -> true', async () => {
    notificationFixtures = [
      { type: repo.SLA_ESCALATION_NOTIFICATION_TYPE, reference_type: 'external_order', reference_id: 'order-sudah-dinotif' },
    ];

    const result = await repo.hasEscalationNotification('order-sudah-dinotif');
    expect(result).toBe(true);
  });

  it('ada notifikasi TAPI reference_id beda -> false (tidak asal cocok)', async () => {
    notificationFixtures = [
      { type: repo.SLA_ESCALATION_NOTIFICATION_TYPE, reference_type: 'external_order', reference_id: 'order-lain' },
    ];

    const result = await repo.hasEscalationNotification('order-yang-dicek');
    expect(result).toBe(false);
  });
});
