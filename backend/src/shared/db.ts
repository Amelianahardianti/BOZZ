// backend/src/shared/db.ts

// SATU pintu koneksi ke database Postgres buat seluruh backend. Dua cara
// akses tersedia di sini karena modul berbeda pakai pola berbeda:
//   - `pool` (raw pg.Pool)   — dipakai sales-inventory, auth-product
//   - `prisma` (Prisma Client) — dipakai ecommerce-sync
// Keduanya connect ke DB yang sama, jadi jumlah koneksi gabungan (pool.max
// + Prisma) tetap perlu diperhatikan terhadap batas Supabase free-tier
// (SRS 10.4) kalau nanti kerasa "too many connections".

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // maksimal 10 koneksi bersamaan, sesuai saran SRS 10.4 (5-10)
});

pool.on('error', (err: Error) => {
  console.error('Error tak terduga dari koneksi database:', err);
});

// Prisma 7 wajib pakai driver adapter (bukan url langsung di datasource
// block) — lihat https://pris.ly/d/driver-adapters.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
