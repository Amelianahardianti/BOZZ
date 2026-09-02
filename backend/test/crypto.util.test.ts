// backend/test/crypto.util.test.ts

// STEP 8 — Hardening: encryption (crypto.util.ts).
//
// Sebelum ini crypto.util.ts (AES-256-GCM, penyimpan credential platform
// e-commerce -- NFR-03) punya 0 test sama sekali. TOKEN_ENCRYPTION_KEY
// di-override ke key palsu KHUSUS TEST (bukan credential production) --
// getKey() di production code membaca process.env.TOKEN_ENCRYPTION_KEY
// LAZY (saat encrypt()/decrypt() dipanggil, bukan saat modul di-import),
// jadi aman diubah per-test tanpa perlu jest.resetModules().

import { encrypt, decrypt } from '../src/modules/ecommerce-sync/crypto.util';
import { describe, expect, it, beforeEach, afterAll } from '@jest/globals';

// 64 hex char = 32 byte -- KHUSUS TEST, bukan credential production.
const VALID_TEST_KEY = 'a'.repeat(64);
const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;

afterAll(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

describe('crypto.util — encrypt/decrypt credential platform (AES-256-GCM)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = VALID_TEST_KEY;
  });

  it('encrypt lalu decrypt menghasilkan plaintext asli', () => {
    const plaintext = 'access-token-rahasia-123';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('ciphertext tidak sama dengan plaintext', () => {
    const plaintext = 'access-token-rahasia-123';
    expect(encrypt(plaintext)).not.toBe(plaintext);
  });

  it('encrypt plaintext yang sama dua kali menghasilkan ciphertext berbeda (IV acak tiap panggilan)', () => {
    const plaintext = 'access-token-rahasia-123';
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it('ciphertext yang dirusak (tamper 1 byte) ditolak decrypt -- auth tag GCM benar-benar dicek', () => {
    const payload = encrypt('access-token-rahasia-123');
    const [iv, tag, data] = payload.split(':');
    const dataRusak = Buffer.from(data, 'base64');
    dataRusak[0] = dataRusak[0] ^ 0xff;
    const payloadRusak = [iv, tag, dataRusak.toString('base64')].join(':');

    expect(() => decrypt(payloadRusak)).toThrow();
  });

  it('key terlalu pendek ditolak (bukan silent/wrong result)', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'terlalu-pendek-buat-jadi-key';
    expect(() => encrypt('apa saja')).toThrow('TOKEN_ENCRYPTION_KEY harus 32 byte');
  });

  it('key kosong/tidak di-set ditolak', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => encrypt('apa saja')).toThrow('TOKEN_ENCRYPTION_KEY harus 32 byte');
  });
});
