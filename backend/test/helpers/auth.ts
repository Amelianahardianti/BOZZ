// backend/test/helpers/auth.ts

// Token login siap pakai untuk test modul SELAIN auth-product.
//
// Kenapa tidak lewat POST /api/auth/login saja? Karena sejak modul
// auth-product tersambung ke Postgres, login beneran butuh database
// (sekarang: Supabase bersama) plus akun yang sudah di-seed di sana.
// Kalau test modul lain ikut lewat sana, akibatnya:
//
//   1. test tidak bisa jalan tanpa jaringan + kredensial database,
//   2. test menulis akun contekan ke database yang dipakai bersama,
//   3. test modul lain ikut merah setiap kali auth-product ganti nama
//      field atau cara simpannya -- padahal yang diuji bukan itu.
//
// Yang benar-benar dipakai modul lain cuma satu: JWT yang lolos
// requireAuth/requireRole di shared/middleware/auth.ts. Itulah batas
// yang ditiru di sini -- token ditandatangani dengan secret yang sama
// dan isi payload yang sama ({ sub, role }).
//
// Menguji bahwa username + password yang benar menghasilkan token tetap
// tugas test milik modul auth-product.

import jwt from 'jsonwebtoken';
import { Role } from '../../src/shared/middleware/auth';

// Harus sama persis dengan default di shared/middleware/auth.ts, kalau
// tidak token buatan sini akan ditolak.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-di-production';

/** ID user yang dipakai test, biar bisa dicocokkan di created_by dkk. */
export const OWNER_ID = 'test-owner';
export const KASIR_ID = 'test-kasir';
export const PENGEPAK_ID = 'test-pengepak';

const DEFAULT_ID: Record<Role, string> = {
  owner: OWNER_ID,
  kasir: KASIR_ID,
  pengepak: PENGEPAK_ID,
};

/** Token untuk sebuah role. `userId` diisi kalau butuh user tertentu. */
export function tokenFor(role: Role, userId: string = DEFAULT_ID[role]): string {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: '1h' });
}

export const ownerToken = (): string => tokenFor('owner');
export const kasirToken = (): string => tokenFor('kasir');
export const staffToken = (role: Role): string => tokenFor(role);
