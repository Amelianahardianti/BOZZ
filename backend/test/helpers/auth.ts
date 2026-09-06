// backend/test/helpers/auth.ts

// Token login siap pakai untuk test modul SELAIN auth-product.
//
// Kenapa tidak lewat POST /api/auth/login saja? Karena login beneran
// butuh password yang cocok, dan yang diuji modul lain bukan itu. Yang
// benar-benar dipakai modul lain cuma satu: JWT yang lolos
// requireAuth/requireRole di shared/middleware/auth.ts. Itulah batas
// yang ditiru di sini -- token ditandatangani dengan secret yang sama
// dan isi payload yang sama ({ sub, role }).
//
// Menguji bahwa username + password yang benar menghasilkan token tetap
// tugas test milik modul auth-product.
//
// TAPI: sejak sales-inventory tersambung ke Postgres, `sub` tidak boleh
// lagi diisi id karangan seperti 'test-owner'. Kolom products.created_by,
// transactions.cashier_user_id, dan tickets.assigned_to_user_id semuanya
// UUID dengan foreign key ke tabel users -- id yang tidak ada barisnya
// bikin INSERT-nya ditolak database.
//
// Jadi id di bawah menunjuk ke tiga akun khusus test yang dibuat lewat
// scripts/seed-test-users.sql. Jalankan script itu dulu di database yang
// dipakai `npm test`, kalau tidak test yang menulis data akan gagal
// dengan pelanggaran foreign key.

import jwt from 'jsonwebtoken';
import { Role } from '../../src/shared/middleware/auth';

// Harus sama persis dengan default di shared/middleware/auth.ts, kalau
// tidak token buatan sini akan ditolak.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-di-production';

/** UUID akun test di scripts/seed-test-users.sql. Harus sama persis. */
export const OWNER_ID = '33333333-3333-4333-8333-333333333301';
export const KASIR_ID = '33333333-3333-4333-8333-333333333302';
export const PENGEPAK_ID = '33333333-3333-4333-8333-333333333303';

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
