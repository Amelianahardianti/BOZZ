// backend/src/shared/db.ts

// Prisma Client singleton dipakai lintas modul. Kenapa singleton: Postgres
// free-tier (Supabase) membatasi jumlah koneksi bersamaan — satu instance
// PrismaClient per proses (bukan per-request) menjaga connection pool tetap
// terkontrol (SRS 10.4).
//
// Prisma 7 wajib pakai driver adapter (bukan url langsung di datasource
// block) — lihat https://pris.ly/d/driver-adapters.

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
