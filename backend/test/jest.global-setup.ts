// backend/test/jest.global-setup.ts

// Dijalankan SEKALI sebelum seluruh suite (lihat globalSetup di
// jest.config.js).
//
// Sejak sales-inventory tersambung ke Postgres, data yang dibuat test
// TIDAK ikut hilang waktu proses selesai -- dulu hilang sendiri karena
// cuma array di memori. Kalau dibiarkan menumpuk, dua hal rusak:
//
//   1. Test yang memakai nama/SKU tetap ('Snack Kering', 'PATCH-A')
//      bentrok dengan sisa run sebelumnya dan membalas 409.
//   2. Test yang memeriksa urutan daftar (GET /tickets) tidak lagi
//      menemukan ticket buatannya sendiri, karena keburu terdorong ke
//      luar batas `limit` oleh ribuan ticket sisa run terdahulu.
//
// Jadi jejak run sebelumnya dihapus dulu di sini.
//
// Yang dihapus HANYA yang jelas-jelas buatan test, dikenali dari akun
// pembuatnya (akun di scripts/seed-test-users.sql + kolam akun pinjaman)
// dan dari penanda pada baris penunjang. Data contoh dari
// scripts/seed-sales-inventory.sql punya created_by NULL, jadi TIDAK
// ikut terhapus -- begitu juga data asli buatan manusia.
//
// Urutannya mengikuti arah foreign key: yang menunjuk dihapus lebih dulu
// daripada yang ditunjuk.

import 'dotenv/config';
import { Pool } from 'pg';

/** Akun test: 3 dari seed-test-users.sql + kolam 44444444-...  */
const AKUN_TEST = `(
  SELECT id FROM users
  WHERE email_or_username LIKE 'test-%-otomatis'
     OR email_or_username LIKE 'test-kolam-%'
)`;

export default async function bersihkanJejakRunSebelumnya(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

  try {
    await pool.query(`DELETE FROM ticket_items WHERE ticket_id IN (
      SELECT id FROM tickets WHERE assigned_by IN ${AKUN_TEST} OR assigned_to_user_id IN ${AKUN_TEST}
    )`);
    await pool.query(
      `DELETE FROM tickets WHERE assigned_by IN ${AKUN_TEST} OR assigned_to_user_id IN ${AKUN_TEST}`
    );

    await pool.query(`DELETE FROM transaction_items WHERE transaction_id IN (
      SELECT id FROM transactions WHERE cashier_user_id IN ${AKUN_TEST}
    )`);
    await pool.query(`DELETE FROM transactions WHERE cashier_user_id IN ${AKUN_TEST}`);

    // Penyesuaian stok ikut menunjuk products, jadi dibersihkan sebelum
    // produknya. Termasuk yang tercatat atas nama akun test lewat
    // checkout/void yang barisnya sudah hilang di atas.
    await pool.query(`DELETE FROM stock_adjustments WHERE adjusted_by_user_id IN ${AKUN_TEST}`);

    // Produk contoh/demo buatan akun test kadang KEPAKE transaksi/adjustment
    // NYATA (owner, kasir asli) pas development/demo manual -- bukan cuma
    // dari akun test sendiri. Baris di atas (yang nyaring lewat cashier/
    // adjusted_by) gak nangkep kasus ini, jadi DELETE FROM products di
    // bawah bisa gagal kena FK constraint. Ditutup di sini: hapus dulu
    // SEMUA transaction_items/stock_adjustments yang mereferensikan produk
    // yang emang bakal dihapus (apa pun pemilik transaksi/adjustment-nya),
    // BUKAN menghapus transaksi/produk lain yang gak relevan. Transaction
    // yang jadi kosong sama sekali (semua item-nya kehapus di atas) ikut
    // dibuang -- baris transaksi tanpa item gak pernah valid secara bisnis
    // (checkout selalu punya >=1 item), jadi aman dianggap sisa cleanup.
    await pool.query(`DELETE FROM transaction_items WHERE product_id IN (
      SELECT id FROM products WHERE created_by IN ${AKUN_TEST}
    )`);
    await pool.query(`DELETE FROM transactions WHERE id NOT IN (
      SELECT DISTINCT transaction_id FROM transaction_items
    )`);
    await pool.query(`DELETE FROM stock_adjustments WHERE product_id IN (
      SELECT id FROM products WHERE created_by IN ${AKUN_TEST}
    )`);

    // Gap yang sama persis, tapi buat ticket packing -- ticket_items juga
    // menunjuk products, dan ticket-nya bisa dibuat lewat akun NYATA
    // (owner/pengepak asli) buat produk demo/test. Pola identik: hapus
    // ticket_items yang menunjuk produk yang bakal dihapus dulu, baru
    // buang ticket yang jadi kosong sama sekali (ticket tanpa item juga
    // gak pernah valid secara bisnis -- createTicket selalu >=1 item).
    await pool.query(`DELETE FROM ticket_items WHERE product_id IN (
      SELECT id FROM products WHERE created_by IN ${AKUN_TEST}
    )`);
    await pool.query(`DELETE FROM tickets WHERE id NOT IN (
      SELECT DISTINCT ticket_id FROM ticket_items
    )`);

    // Produk & kategori contoh punya created_by NULL -- sengaja tidak
    // ikut kena, supaya seed-nya tidak perlu dijalankan ulang tiap kali.
    await pool.query(`DELETE FROM products WHERE created_by IN ${AKUN_TEST}`);
    await pool.query(`DELETE FROM categories WHERE created_by IN ${AKUN_TEST}`);

    // Baris penunjang buatan test/helpers/fixtures.ts.
    await pool.query(`DELETE FROM external_orders WHERE external_order_id LIKE 'TEST-%'`);
    await pool.query(`DELETE FROM customers WHERE source = 'test-fixture'`);
  } finally {
    await pool.end();
  }
}
