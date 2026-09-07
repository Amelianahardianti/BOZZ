// backend/test/test-db-safety-guard.test.ts

// Regression guard (TASK — Jest Test Architecture & Fixture Hardening,
// Section 18): membuktikan assertSafeTestDatabaseUrl() menolak SEBELUM
// koneksi/tulisan apa pun terjadi -- fungsi ini murni parsing string,
// TIDAK PERNAH membuka koneksi network, jadi "gagal sebelum write" bukan
// klaim, tapi struktural (tidak ada cara buat function ini menulis apa
// pun, bahkan kalau mau).
//
// Skenario D & E (`npx jest` / `npx jest test/tickets.test.ts` langsung,
// tanpa DOTENV_CONFIG_PATH) TIDAK dites di sini lewat spawn child-process
// (mahal & rapuh) -- dibuktikan lewat verifikasi manual di laporan akhir
// (jalankan command aslinya sungguhan), karena keduanya toh cuma
// memanggil FUNGSI YANG SAMA yang dites di sini (jest.global-setup.ts
// memanggilnya duluan sebelum semua jalur command apa pun).

import { describe, expect, it } from '@jest/globals';
import { assertSafeTestDatabaseUrl, TestDatabaseSafetyError } from '../src/shared/testDbSafety';

describe('assertSafeTestDatabaseUrl -- fail-closed guard (Task: Jest DB safety hardening)', () => {
  it('Skenario A -- DATABASE_URL menunjuk Docker test DB (localhost:5433/pos_platform) -> TIDAK throw', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://postgres:postgres@localhost:5433/pos_platform')
    ).not.toThrow();
  });

  it('Skenario A -- host 127.0.0.1 juga diterima (alias localhost)', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:5433/pos_platform')
    ).not.toThrow();
  });

  it('Skenario B -- DATABASE_URL menunjuk Supabase -> throw SEBELUM tulisan apa pun (murni parsing, tidak connect)', () => {
    const supabaseLike = 'postgresql://postgres:rahasia-super-panjang@db.abcdefghijk.supabase.co:5432/postgres';

    expect(() => assertSafeTestDatabaseUrl(supabaseLike)).toThrow(TestDatabaseSafetyError);
    expect(() => assertSafeTestDatabaseUrl(supabaseLike)).toThrow(/TEST DATABASE SAFETY CHECK FAILED/);
  });

  it('Skenario B -- pesan error menyebut host/db yang terdeteksi, TAPI TIDAK PERNAH mencetak password', () => {
    const supabaseLike = 'postgresql://postgres:rahasia-super-panjang@db.abcdefghijk.supabase.co:5432/postgres';

    try {
      assertSafeTestDatabaseUrl(supabaseLike);
      throw new Error('seharusnya sudah throw sebelum baris ini');
    } catch (err) {
      expect(err).toBeInstanceOf(TestDatabaseSafetyError);
      const message = (err as Error).message;
      expect(message).toContain('db.abcdefghijk.supabase.co');
      expect(message).toContain('postgres'); // nama database, bukan password
      expect(message).not.toContain('rahasia-super-panjang');
    }
  });

  it('Skenario C -- DATABASE_URL undefined (mis. DOTENV_CONFIG_PATH salah/hilang) -> throw', () => {
    expect(() => assertSafeTestDatabaseUrl(undefined)).toThrow(TestDatabaseSafetyError);
    expect(() => assertSafeTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL tidak ter-set/);
  });

  it('port benar tapi host/database salah tetap ditolak (bukan cuma cek salah satu field)', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://postgres:postgres@localhost:5433/postgres')
    ).toThrow(TestDatabaseSafetyError);
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://postgres:postgres@evil-host:5433/pos_platform')
    ).toThrow(TestDatabaseSafetyError);
  });

  it('host+database benar tapi port salah (mis. kelupaan balik ke 5432 native Postgres) tetap ditolak', () => {
    expect(() =>
      assertSafeTestDatabaseUrl('postgresql://postgres:postgres@localhost:5432/pos_platform')
    ).toThrow(TestDatabaseSafetyError);
  });

  it('URL yang tidak valid sama sekali -> throw, bukan crash tak terduga', () => {
    expect(() => assertSafeTestDatabaseUrl('bukan-url-valid')).toThrow(TestDatabaseSafetyError);
  });
});

describe('Guard benar-benar aktif di run Jest yang sedang jalan ini (bukti env, bukan cuma klaim)', () => {
  it('DATABASE_URL proses ini SENDIRI adalah Docker test DB (globalSetup sudah lolos guard sebelum file ini jalan)', () => {
    expect(() => assertSafeTestDatabaseUrl(process.env.DATABASE_URL)).not.toThrow();
  });

  it('JEST_WORKER_ID ter-set di proses test ini -- syarat defense-in-depth di src/shared/db.ts aktif', () => {
    expect(process.env.JEST_WORKER_ID).toBeDefined();
  });
});
