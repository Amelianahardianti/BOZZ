// backend/test/sla-escalation.test.ts

// TASK #14 — SLA Escalation Alerts (FR-OC-09), level orchestration (modul
// ecommerce-sync / Order Hub).
//
// Filter query-nya sendiri (kondisi "dekat deadline" & "belum ada ticket")
// SUDAH dibuktikan di sla-escalation-repository.test.ts lewat query Prisma
// ASLI (fake `prisma`, bukan mock repository.ts). File ini menguji
// runSlaEscalationCheck() di service.ts -- repository.ts DAN
// auth-product/repository.ts (dipanggil tidak langsung lewat
// createNotification()/listStaff() dari '../auth-product') di-mock total,
// pola sama dengan order-received-consumer.test.ts / ticket-completion-
// forwards-to-platform.test.ts.
//
// Yang dibuktikan: notifikasi eskalasi benar-benar dibuat ke Owner aktif
// (bukan kasir/pengepak) dengan reference_type/reference_id yang benar,
// dedup lintas eksekusi (order yang sudah pernah dinotif TIDAK dinotif
// lagi), dan bahwa fungsi ini SENGAJA menolak jalan kalau threshold-nya
// belum di-set (tidak diam-diam menebak angka).

import { describe, expect, it, jest, afterEach, beforeEach } from '@jest/globals';
import { randomUUID } from 'crypto';
import * as repo from '../src/modules/ecommerce-sync/repository';
import * as authRepo from '../src/modules/auth-product/repository';
import type { User } from '../src/modules/auth-product/repository';
import { runSlaEscalationCheck } from '../src/modules/ecommerce-sync/service';

jest.mock('../src/modules/ecommerce-sync/repository');
jest.mock('../src/modules/auth-product/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;
const mockedAuthRepo = authRepo as jest.Mocked<typeof authRepo>;

const NOW = new Date('2026-01-01T12:00:00.000Z');
const ORIGINAL_THRESHOLD = process.env.SLA_ESCALATION_THRESHOLD_MINUTES;

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: randomUUID(),
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

function buildCandidate(overrides: Partial<repo.EscalationCandidate> = {}): repo.EscalationCandidate {
  return {
    id: randomUUID(),
    platform_id: 'platform-1',
    external_order_id: 'CART-1',
    sla_type: 'instant',
    sla_deadline: new Date('2026-01-01T12:30:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.SLA_ESCALATION_THRESHOLD_MINUTES = '60';
});

afterEach(() => {
  jest.clearAllMocks();
  if (ORIGINAL_THRESHOLD === undefined) {
    delete process.env.SLA_ESCALATION_THRESHOLD_MINUTES;
  } else {
    process.env.SLA_ESCALATION_THRESHOLD_MINUTES = ORIGINAL_THRESHOLD;
  }
});

describe('runSlaEscalationCheck — threshold wajib di-set (tidak menebak angka)', () => {
  it('SLA_ESCALATION_THRESHOLD_MINUTES tidak di-set -> menolak jalan (throw), bukan pakai angka default diam-diam', async () => {
    delete process.env.SLA_ESCALATION_THRESHOLD_MINUTES;

    await expect(runSlaEscalationCheck(NOW)).rejects.toThrow(/SLA_ESCALATION_THRESHOLD_MINUTES/);
    expect(mockedRepo.findOrdersNeedingEscalation).not.toHaveBeenCalled();
  });

  it('SLA_ESCALATION_THRESHOLD_MINUTES bukan angka positif -> menolak jalan (throw)', async () => {
    process.env.SLA_ESCALATION_THRESHOLD_MINUTES = '-5';

    await expect(runSlaEscalationCheck(NOW)).rejects.toThrow(/positif/);
  });
});

describe('runSlaEscalationCheck — orchestration (repository & auth-product di-mock)', () => {
  it('1. order eligible, belum pernah dinotif -> createNotification dipanggil untuk owner aktif dengan field yang benar', async () => {
    const candidate = buildCandidate({ id: 'order-1', external_order_id: 'CART-901', sla_type: 'instant' });
    mockedRepo.findOrdersNeedingEscalation.mockResolvedValue([candidate]);
    mockedRepo.hasEscalationNotification.mockResolvedValue(false);

    const owner = buildUser({ id: 'owner-1', role: 'owner', is_active: true });
    mockedAuthRepo.listStaff.mockResolvedValue([owner]);
    mockedAuthRepo.createNotification.mockResolvedValue({
      id: 'notif-1',
      user_id: 'owner-1',
      type: repo.SLA_ESCALATION_NOTIFICATION_TYPE,
      title: '',
      message: null,
      reference_type: 'external_order',
      reference_id: 'order-1',
      is_read: false,
      created_at: new Date().toISOString(),
    });

    const result = await runSlaEscalationCheck(NOW);

    expect(mockedRepo.findOrdersNeedingEscalation).toHaveBeenCalledWith(NOW, 60 * 60 * 1000);
    expect(mockedAuthRepo.createNotification).toHaveBeenCalledTimes(1);
    const [input] = mockedAuthRepo.createNotification.mock.calls[0];
    expect(input.user_id).toBe('owner-1');
    expect(input.reference_type).toBe('external_order');
    expect(input.reference_id).toBe('order-1');
    expect(input.type).toBe(repo.SLA_ESCALATION_NOTIFICATION_TYPE);
    expect(result).toEqual({ notified: 1, skipped: 0 });
  });

  it('kasir/pengepak dan owner nonaktif TIDAK dikabari -- cuma owner aktif (konsisten dengan konvensi ORDER_RECEIVED)', async () => {
    mockedRepo.findOrdersNeedingEscalation.mockResolvedValue([buildCandidate({ id: 'order-2' })]);
    mockedRepo.hasEscalationNotification.mockResolvedValue(false);
    mockedAuthRepo.listStaff.mockResolvedValue([
      buildUser({ id: 'kasir-1', role: 'kasir' }),
      buildUser({ id: 'pengepak-1', role: 'pengepak' }),
      buildUser({ id: 'owner-nonaktif', role: 'owner', is_active: false }),
      buildUser({ id: 'owner-aktif', role: 'owner', is_active: true }),
    ]);
    mockedAuthRepo.createNotification.mockResolvedValue({} as Awaited<ReturnType<typeof authRepo.createNotification>>);

    await runSlaEscalationCheck(NOW);

    expect(mockedAuthRepo.createNotification).toHaveBeenCalledTimes(1);
    expect(mockedAuthRepo.createNotification.mock.calls[0][0].user_id).toBe('owner-aktif');
  });

  it('5. order yang sudah pernah dinotif (hasEscalationNotification=true) -> TIDAK dinotif lagi (dedup lintas eksekusi)', async () => {
    mockedRepo.findOrdersNeedingEscalation.mockResolvedValue([buildCandidate({ id: 'order-sudah-dinotif' })]);
    mockedRepo.hasEscalationNotification.mockResolvedValue(true);

    const result = await runSlaEscalationCheck(NOW);

    expect(mockedAuthRepo.listStaff).not.toHaveBeenCalled();
    expect(mockedAuthRepo.createNotification).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0, skipped: 1 });
  });

  it('tidak ada order eligible sama sekali -> tidak crash, hasil {notified:0, skipped:0}', async () => {
    mockedRepo.findOrdersNeedingEscalation.mockResolvedValue([]);

    const result = await runSlaEscalationCheck(NOW);

    expect(result).toEqual({ notified: 0, skipped: 0 });
    expect(mockedAuthRepo.createNotification).not.toHaveBeenCalled();
  });

  it('gagal membuat notifikasi untuk 1 owner TIDAK menjatuhkan proses order lain', async () => {
    mockedRepo.findOrdersNeedingEscalation.mockResolvedValue([
      buildCandidate({ id: 'order-a' }),
      buildCandidate({ id: 'order-b' }),
    ]);
    mockedRepo.hasEscalationNotification.mockResolvedValue(false);
    mockedAuthRepo.listStaff.mockResolvedValue([buildUser({ id: 'owner-1', role: 'owner' })]);
    mockedAuthRepo.createNotification
      .mockRejectedValueOnce(new Error('DB sempat down'))
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof authRepo.createNotification>>);

    const result = await runSlaEscalationCheck(NOW);

    expect(mockedAuthRepo.createNotification).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ notified: 2, skipped: 0 });
  });
});
