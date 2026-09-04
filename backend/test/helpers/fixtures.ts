// backend/test/helpers/fixtures.ts

// Baris database yang dibutuhkan test sales-inventory sejak modulnya
// tersambung ke Postgres.
//
// Dua macam isinya:
//   1. id data contoh dari scripts/seed-sales-inventory.sql -- dulu ini
//      "seed-product-1" dkk yang muncul sendiri dari array di memori.
//   2. pembuat baris penunjang (external_orders), buat test yang butuh
//      foreign key-nya benar-benar ada.

import { prisma } from '../../src/shared/db';

/** Kategori dari scripts/seed-sales-inventory.sql. */
export const KATEGORI_MAKANAN_ID = '11111111-1111-4111-8111-111111111101';
export const KATEGORI_MINUMAN_ID = '11111111-1111-4111-8111-111111111102';

/** Produk dari scripts/seed-sales-inventory.sql. */
export const PRODUK_ROTI_ID = '22222222-2222-4222-8222-222222222201';
export const PRODUK_TEH_ID = '22222222-2222-4222-8222-222222222202';

/**
 * Bikin satu baris external_orders dan kembalikan id-nya.
 *
 * Dibutuhkan karena tickets.external_order_id punya foreign key ke
 * external_orders -- UUID acak yang tidak ada barisnya akan ditolak
 * database. Tiap pemanggilan bikin order baru supaya test tidak saling
 * berebut: satu order cuma boleh punya satu ticket.
 */
export async function bikinExternalOrder(): Promise<string> {
  // Platform mana pun boleh; yang penting baris external_orders-nya ada.
  // Dipakai ulang kalau sudah ada, biar test tidak menumpuk platform.
  //
  // Nama platform TIDAK bebas: ada CHECK platforms_platform_name_check yang
  // cuma mengizinkan shopee/tokopedia/tiktok/fakestore. Dipakai 'fakestore'
  // -- satu-satunya yang tidak butuh credential -- dan kebetulan juga yang
  // pertama secara alfabet, jadi baris yang dipakai sama saja antara
  // database kosong (CI) dan database dev yang sudah berisi ketiganya.
  const platform =
    (await prisma.platforms.findFirst({ orderBy: { platform_name: 'asc' } })) ??
    (await prisma.platforms.create({
      data: { platform_name: 'fakestore', is_connected: false },
    }));

  const order = await prisma.external_orders.create({
    data: {
      platform_id: platform.id,
      external_order_id: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      status: 'new',
      sla_type: 'reguler',
    },
  });

  return order.id;
}

/**
 * Bikin satu baris customers dan kembalikan id-nya.
 *
 * Dibutuhkan karena transactions.customer_id punya foreign key ke
 * customers -- UUID acak yang tidak ada barisnya akan ditolak database.
 */
export async function bikinCustomer(): Promise<string> {
  const customer = await prisma.customers.create({
    data: {
      external_username: `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      source: 'test-fixture',
    },
  });
  return customer.id;
}

// ---------------------------------------------------------------------
// Kolam akun pinjaman
// ---------------------------------------------------------------------

// Test ticket memakai banyak "pengepak" berbeda dalam satu file. Yang
// menentukan boleh/tidaknya sebuah akun dikasih ticket adalah mock
// auth-product (findActiveUser), BUKAN isi tabel users -- jadi baris di
// database sebenarnya cuma perlu ADA, supaya foreign key
// tickets.assigned_to_user_id tidak dilanggar. Peran dan status aktifnya
// tidak dipakai siapa pun.
//
// Karena itu id-nya tidak dibikin acak tiap kali: sekumpulan baris
// dengan UUID tetap disiapkan sekali, lalu dipinjam bergantian. Kalau
// acak, tiap kali test jalan akan menumpuk akun baru di database bersama
// tanpa pernah habis.

const JUMLAH_AKUN_KOLAM = 120;

function idAkunKolam(nomor: number): string {
  return `44444444-4444-4444-8444-${String(nomor).padStart(12, '0')}`;
}

/**
 * Pastikan baris-baris akun pinjaman ada. Panggil sekali di beforeAll.
 * Aman diulang: baris yang sudah ada dibiarkan.
 */
export async function siapkanKolamAkun(): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO users (id, name, email_or_username, password_hash, role, is_active)
    SELECT
      ('44444444-4444-4444-8444-' || lpad(i::text, 12, '0'))::uuid,
      '[test] Akun Pinjaman ' || i,
      'test-kolam-' || i,
      'x-tidak-bisa-login',
      'pengepak',
      true
    FROM generate_series(1, ${JUMLAH_AKUN_KOLAM}) AS i
    ON CONFLICT (id) DO NOTHING
  `;
}

let terpakai = 0;

/**
 * Pinjam satu id akun yang belum dipakai di file test ini.
 *
 * Sengaja sinkron supaya bisa dipanggil dari helper test yang sudah ada
 * tanpa mengubah semuanya jadi async.
 */
export function pinjamAkun(): string {
  terpakai += 1;
  if (terpakai > JUMLAH_AKUN_KOLAM) {
    throw new Error(
      `Kolam akun test habis (${JUMLAH_AKUN_KOLAM}). Naikkan JUMLAH_AKUN_KOLAM di test/helpers/fixtures.ts.`
    );
  }
  return idAkunKolam(terpakai);
}
