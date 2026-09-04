// backend/test/sla.util.test.ts

// TEST #3 — SLA (modul ecommerce-sync / Order Hub).
//
// Menguji classifySla() dan computeSlaDeadline() -- klasifikasi SLA dari
// nama kurir + hitung deadline pengiriman (FR-OC-03, SRS 9.3). Tidak ada
// DB/external API yang terlibat, jadi tidak butuh mock apa pun -- murni
// unit test atas sla.util.ts.
//
// CATATAN AUDIT (Batch 2, task #7): angka SLA_HOURS.reguler=48 di
// sla.util.ts:15 adalah PLACEHOLDER -- dikonfirmasi ulang lewat pencarian
// di repo ini (contracts/api.yaml, schema.prisma, seluruh backend/src):
// tidak ada satu pun sumber yang menyebutkan angka jam resmi untuk SLA
// "reguler". contracts/api.yaml#SlaType cuma mendaftar 3 NAMA tipe
// (instant/same_day/reguler), tidak ada nilai numerik. Karena tidak ada
// source of truth, angka production TIDAK diubah di batch ini -- hanya
// menambah test yang membuktikan PERILAKU yang sudah pasti dari kode
// (bukan menebak angka yang benar): urutan prioritas keyword saat carrier
// mengandung lebih dari satu keyword, dan bahwa hitungannya timezone-safe.

import { classifySla, computeSlaDeadline } from '../src/modules/ecommerce-sync/sla.util';
import { describe, expect, it, afterEach } from '@jest/globals';

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

  it('carrier mengandung keyword instant DAN same_day sekaligus -> instant menang (urutan cek di kode: instant duluan)', () => {
    // Bukan requirement dari SRS (belum ada carrier nyata yang begini) --
    // ini mendokumentasikan PERILAKU DETERMINISTIK kode saat ini, supaya
    // kalau urutan pengecekan di classifySla() berubah suatu saat, ada
    // test yang menandakannya secara eksplisit, bukan diam-diam berubah.
    expect(classifySla('GrabExpress Instant Same Day')).toBe('instant');
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

describe('computeSlaDeadline — timezone-safe (murni epoch ms, tidak terpengaruh TZ proses)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('hasil sama persis walau proses jalan di timezone ber-DST (America/New_York) -- bukan dihitung dari local time', () => {
    process.env.TZ = 'America/New_York';

    // 9 Maret 2026 adalah tanggal DST "spring forward" di Amerika --
    // kalau computeSlaDeadline diam-diam pakai perhitungan jam lokal
    // (bukan epoch ms murni), hasilnya akan meleset 1 jam persis di
    // sekitar tanggal ini.
    const receivedAt = new Date('2026-03-09T05:00:00.000Z');

    expect(computeSlaDeadline(receivedAt, 'instant')).toEqual(new Date('2026-03-09T08:00:00.000Z'));
    expect(computeSlaDeadline(receivedAt, 'same_day')).toEqual(new Date('2026-03-09T11:00:00.000Z'));
  });
});
