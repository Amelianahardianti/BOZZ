// Setiap file test dapet module registry sendiri (Jest default), jadi
// src/shared/db.ts (pool pg + PrismaClient) ke-import ULANG per file dan
// buka koneksi baru tiap kali. Tanpa ditutup, semuanya nyangkut habis test
// selesai -- itu penyebab "A worker process has failed to exit gracefully".
import { pool, prisma } from '../src/shared/db';

afterAll(async () => {
  await Promise.all([pool.end(), prisma.$disconnect()]);
});
