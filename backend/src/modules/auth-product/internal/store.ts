// backend/src/modules/auth-product/internal/store.ts

// File ini adalah "database sementara" - cuma array biasa di memori.
// Nanti kalau temanmu udah selesai bikin database beneran, isi file ini
// diganti jadi query ke Postgres. File lain (service.ts, routes.ts)
// TIDAK PERLU diubah sama sekali kalau nanti ganti ke database asli,
// asal nama dan bentuk fungsinya tetap sama.

import bcrypt from 'bcryptjs';

export type Role = 'owner' | 'kasir' | 'pengepak';

export interface User {
  id: string;
  name: string;
  username: string;
  password_hash: string;
  role: Role;
  phone: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Akun Owner pertama, dibikin manual sekali di awal (bukan lewat form).
// Password default: "owner123" -- WAJIB diganti nanti, ini cuma buat coba-coba.
const initialUsers: User[] = [
  {
    id: 'seed-owner-1',
    name: 'Owner Toko',
    username: 'owner',
    password_hash: bcrypt.hashSync('owner123', 10),
    role: 'owner',
    phone: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Ini "tabel users" versi sementara di memori.
export const users: User[] = [...initialUsers];

let idCounter = users.length + 1;
export function nextId(): string {
  return `user-${idCounter++}`;
}