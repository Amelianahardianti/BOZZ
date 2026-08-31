// backend/src/shared/db.ts

// Ini SATU pintu koneksi ke database Postgres buat SELURUH backend.
// Semua modul (auth-product, sales-inventory, ecommerce-sync) pakai
// "pool" yang sama ini buat query ke database -- bukan bikin koneksi
// baru sendiri-sendiri.
//
// "Pool" itu semacam kumpulan koneksi yang dipakai bergantian, bukan
// bikin koneksi baru tiap ada request (SRS 10.4 -- database gratisan
// kayak Supabase/Neon punya batas jumlah koneksi bersamaan).

import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // maksimal 10 koneksi bersamaan, sesuai saran SRS 10.4 (5-10)
});

pool.on('error', (err: Error) => {
  console.error('Error tak terduga dari koneksi database:', err);
});