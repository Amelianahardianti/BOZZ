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
// ---------------------------------------------------------------------
// DEPENDENCY MAP (diaudit langsung dari prisma/schema.prisma, bukan
// diasumsikan -- lihat setiap `@relation(fields: ...)` yang menunjuk ke
// salah satu dari 6 tabel yang dibersihkan di bawah: products,
// categories, tickets, transactions, external_orders, customers).
//
//   products (dihapus via created_by)
//     <- transaction_items.product_id
//     <- stock_adjustments.product_id
//     <- ticket_items.product_id
//     <- external_order_items.product_id   (mis. via SKU-mapping yang
//                                            menautkan order marketplace
//                                            ke produk internal)
//     <- channel_listings.product_id       (schema ada, TIDAK ADA kode
//                                            manapun di src/ yang pernah
//                                            menulis ke sini -- 0 baris,
//                                            selalu -- dimasukkan tetap
//                                            demi kelengkapan/jaga-jaga,
//                                            bukan karena pernah terjadi)
//     <- product_batches.product_id        (idem -- schema ada, TIDAK
//                                            dipakai kode manapun di src/)
//     <- shopping_list_items.product_id    (idem)
//
//   categories (dihapus via created_by)
//     <- products.category_id              (produk test SUDAH dihapus
//                                            duluan di atas; guard
//                                            NOT EXISTS jaga-jaga kalau
//                                            ada produk ASLI/manual yang
//                                            kebetulan pakai kategori
//                                            test ini -- kategori itu
//                                            dilewati, bukan bikin crash)
//
//   tickets (dihapus via assigned_by/assigned_to ATAU produk/order yang
//            bakal dihapus)
//     <- ticket_items.ticket_id
//
//   transactions (dihapus via cashier_user_id ATAU produk yang bakal
//                 dihapus)
//     <- transaction_items.transaction_id
//
//   external_orders (dihapus via external_order_id LIKE 'TEST-%')
//     <- external_order_items.external_order_id
//     <- order_packages.external_order_id
//     <- order_shipping_address.external_order_id
//     <- tickets.external_order_id          (sudah dihapus di batch
//                                            ticket di atas -- dimasukkan
//                                            juga ke definisi TICKET_IDS
//                                            biar order TEST-% yang py
//                                            ticket dari akun NON-test
//                                            pun tetap ketutup)
//
//   customers (dihapus via source = 'test-fixture')
//     <- external_orders.customer_id        (sudah dihapus di atas)
//     <- transactions.customer_id           (sudah dihapus di atas;
//                                            guard NOT EXISTS jaga-jaga
//                                            kalau ada transaksi ASLI
//                                            yang kebetulan pakai
//                                            customer test-fixture ini)
//
// Prinsip tiap langkah: HITUNG DULU set lengkap baris yang akan dihapus
// (union dari "milik akun test" DAN "menunjuk baris yang bakal dihapus
// juga"), baru hapus child-nya, baru hapus parent-nya. BUKAN "hapus
// parent lalu asumsikan child ikut hilang" (itu yang bikin bug
// sebelumnya: pola `NOT IN (SELECT ... FROM child)` gagal ketika parent
// masih dirujuk child yang levelnya di luar dugaan awal).
// ---------------------------------------------------------------------

import 'dotenv/config';
import { Pool } from 'pg';

/** Akun test: 3 dari seed-test-users.sql + kolam 44444444-...  */
const AKUN_TEST = `(
  SELECT id FROM users
  WHERE email_or_username LIKE 'test-%-otomatis'
     OR email_or_username LIKE 'test-kolam-%'
)`;

/** Produk yang BAKAL dihapus di run ini -- dipakai berulang di bawah. */
const TEST_PRODUCTS = `(SELECT id FROM products WHERE created_by IN ${AKUN_TEST})`;

/** Order penunjang buatan test/helpers/fixtures.ts (bikinExternalOrder()). */
const TEST_ORDERS = `(SELECT id FROM external_orders WHERE external_order_id LIKE 'TEST-%')`;

/**
 * Set LENGKAP ticket yang bakal dihapus -- union 3 kondisi: milik akun
 * test, ATAU item-nya menunjuk produk test, ATAU order-nya order
 * penunjang test. Dihitung SEKALI di sini (bukan orphan-by-elimination
 * setelah sebagian dihapus) supaya gak ada baris ticket_items yang
 * lolos tercatat lalu bikin DELETE FROM tickets gagal kena FK.
 */
const TICKETS_TO_DELETE = `(
  SELECT id FROM tickets WHERE assigned_by IN ${AKUN_TEST} OR assigned_to_user_id IN ${AKUN_TEST}
  UNION
  SELECT ticket_id FROM ticket_items WHERE product_id IN ${TEST_PRODUCTS}
  UNION
  SELECT id FROM tickets WHERE external_order_id IN ${TEST_ORDERS}
)`;

/** Sama seperti TICKETS_TO_DELETE, tapi buat transactions. */
const TRANSACTIONS_TO_DELETE = `(
  SELECT id FROM transactions WHERE cashier_user_id IN ${AKUN_TEST}
  UNION
  SELECT transaction_id FROM transaction_items WHERE product_id IN ${TEST_PRODUCTS}
)`;

export default async function bersihkanJejakRunSebelumnya(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

  try {
    // --- ticket_items -> tickets ---
    await pool.query(`DELETE FROM ticket_items WHERE ticket_id IN ${TICKETS_TO_DELETE}`);
    await pool.query(`DELETE FROM tickets WHERE id IN ${TICKETS_TO_DELETE}`);

    // --- transaction_items -> transactions ---
    await pool.query(`DELETE FROM transaction_items WHERE transaction_id IN ${TRANSACTIONS_TO_DELETE}`);
    await pool.query(`DELETE FROM transactions WHERE id IN ${TRANSACTIONS_TO_DELETE}`);

    // --- child produk lain (selain 2 di atas) ---
    await pool.query(
      `DELETE FROM stock_adjustments WHERE adjusted_by_user_id IN ${AKUN_TEST} OR product_id IN ${TEST_PRODUCTS}`
    );
    await pool.query(
      `DELETE FROM external_order_items WHERE external_order_id IN ${TEST_ORDERS} OR product_id IN ${TEST_PRODUCTS}`
    );
    // channel_listings/product_batches/shopping_list_items: TIDAK ADA kode
    // di src/ yang pernah menulis ke tabel ini (dicek langsung, bukan
    // diasumsikan) -- selalu 0 baris hari ini, dimasukkan cuma sebagai
    // jaga-jaga kalau suatu saat ada yang mulai memakainya.
    await pool.query(`DELETE FROM channel_listings WHERE product_id IN ${TEST_PRODUCTS}`);
    await pool.query(`DELETE FROM product_batches WHERE product_id IN ${TEST_PRODUCTS}`);
    await pool.query(`DELETE FROM shopping_list_items WHERE product_id IN ${TEST_PRODUCTS}`);

    // --- child order lain (selain tickets, sudah di atas) ---
    await pool.query(`DELETE FROM order_packages WHERE external_order_id IN ${TEST_ORDERS}`);
    await pool.query(`DELETE FROM order_shipping_address WHERE external_order_id IN ${TEST_ORDERS}`);

    // --- produk & kategori contoh: created_by NULL sengaja tidak ikut
    // kena, supaya seed-nya tidak perlu dijalankan ulang tiap kali ---
    await pool.query(`DELETE FROM products WHERE created_by IN ${AKUN_TEST}`);
    // Guard NOT EXISTS -- lewati (bukan crash) kalau ternyata masih ada
    // produk ASLI/manual yang kebetulan pakai kategori test ini.
    await pool.query(`DELETE FROM categories WHERE created_by IN ${AKUN_TEST} AND NOT EXISTS (
      SELECT 1 FROM products WHERE products.category_id = categories.id
    )`);

    // --- baris penunjang buatan test/helpers/fixtures.ts ---
    await pool.query(`DELETE FROM external_orders WHERE external_order_id LIKE 'TEST-%'`);
    // Guard NOT EXISTS -- lewati (bukan crash) kalau ternyata masih ada
    // order/transaksi ASLI/manual yang kebetulan pakai customer ini.
    await pool.query(`DELETE FROM customers WHERE source = 'test-fixture' AND NOT EXISTS (
      SELECT 1 FROM external_orders WHERE external_orders.customer_id = customers.id
    ) AND NOT EXISTS (
      SELECT 1 FROM transactions WHERE transactions.customer_id = customers.id
    )`);
  } finally {
    await pool.end();
  }
}
