// backend/test/sla.util.test.ts

// TEST #3 — SLA (modul ecommerce-sync / Order Hub).
//
// Menguji classifySla() dan computeSlaDeadline() -- klasifikasi SLA dari
// nama kurir + hitung deadline pengiriman (FR-OC-03, SRS 9.3). Tidak ada
// DB/external API yang terlibat, jadi tidak butuh mock apa pun -- murni
// unit test atas sla.util.ts.

import { classifySla, computeSlaDeadline } from '../src/modules/ecommerce-sync/sla.util';
import { describe, expect, it } from '@jest/globals';

describe('classifySla', () => {
  it('carrier mengandung "instant" -> instant', () => {
    expect(classifySla('GrabExpress Instant')).toBe('instant');
  });

  it('carrier mengandung "same day" -> same_day', () => {
    expect(classifySla('JNE Same Day')).toBe('same_day');
  });

  it('carrier reguler / tidak cocok keyword apa pun -> reguler', () => {
    expect(classifySla('JNE Reguler')).toBe('reguler');
  });

  it('case-insensitive', () => {
    expect(classifySla('grabexpress INSTANT')).toBe('instant');
    expect(classifySla('SAME DAY')).toBe('same_day');
  });

  it('null, undefined, dan empty string -> reguler', () => {
    expect(classifySla(null)).toBe('reguler');
    expect(classifySla(undefined)).toBe('reguler');
    expect(classifySla('')).toBe('reguler');
  });
});

describe('computeSlaDeadline', () => {
  const receivedAt = new Date('2026-01-01T00:00:00.000Z');

  it('instant -> receivedAt + 3 jam', () => {
    expect(computeSlaDeadline(receivedAt, 'instant')).toEqual(new Date('2026-01-01T03:00:00.000Z'));
  });

  it('same_day -> receivedAt + 6 jam', () => {
    expect(computeSlaDeadline(receivedAt, 'same_day')).toEqual(new Date('2026-01-01T06:00:00.000Z'));
  });

  it('reguler -> receivedAt + 48 jam', () => {
    expect(computeSlaDeadline(receivedAt, 'reguler')).toEqual(new Date('2026-01-03T00:00:00.000Z'));
  });
});
