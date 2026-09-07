// backend/scripts/setup-fakestore-demo-mapping.ts
//
// One-off, manual setup -- BUKAN endpoint, BUKAN dijalankan otomatis.
// Task 8B: mengisi mapping channel_listings NYATA untuk demo FakeStore,
// pakai arsitektur yang sudah diimplementasikan & dites di Task 7B
// (repository.ts upsertExternalOrderRow: channel_listings prioritas 1,
// products.sku fallback prioritas 2).
//
// TIDAK mengubah FakeStore adapter -- externalItemRef TETAP
// String(FakeStore productId) apa adanya (lihat
// adapters/fakestore/index.ts, tidak disentuh sama sekali). Script ini
// cuma mengisi SISI BOZZ dari mapping-nya: produk internal + baris
// channel_listings yang menghubungkan FakeStore product id ke product_id
// BOZZ.
//
// Aman dijalankan berkali-kali (idempotent):
//   - Produk BOZZ: find-by-SKU dulu, cuma create kalau belum ada.
//   - channel_listings: upsert() pakai @@unique([platform_id,
//     external_item_id]) yang sudah ada di schema -- run kedua dst akan
//     UPDATE baris yang sama, bukan bikin duplikat.
//
// Jalankan manual sekali (target: DATABASE_URL di .env -- Supabase dev,
// BUKAN .env.test/Docker): npx ts-node scripts/setup-fakestore-demo-mapping.ts

import 'dotenv/config';
import { prisma } from '../src/shared/db';

// Data demo -- 3 produk FakeStore asli (dari GET https://fakestoreapi.com/products,
// katalog publik yang stabil), masing-masing dipasangkan ke SATU produk BOZZ.
// SKU BOZZ SENGAJA TIDAK dibuat sama dengan FakeStore id -- itu justru
// membuktikan channel_listings, bukan fallback SKU, yang menghubungkan
// keduanya (lihat laporan Task 7B).
const DEMO_MAPPINGS: {
  fakestoreProductId: string;
  fakestoreTitle: string;
  bozzProduct: { name: string; sku: string; price: number; stock_qty: number };
}[] = [
  {
    fakestoreProductId: '1',
    fakestoreTitle: "Fjallraven - Foldsack No. 1 Backpack, Fits 15 Laptops",
    bozzProduct: { name: 'Fjallraven Backpack', sku: 'BOZZ-BAG-001', price: 350000, stock_qty: 20 },
  },
  {
    fakestoreProductId: '2',
    fakestoreTitle: 'Mens Casual Premium Slim Fit T-Shirts',
    bozzProduct: { name: 'Mens Premium T-Shirt', sku: 'BOZZ-SHIRT-001', price: 120000, stock_qty: 30 },
  },
  {
    fakestoreProductId: '9',
    fakestoreTitle: 'WD 2TB Elements Portable External Hard Drive',
    bozzProduct: { name: 'WD 2TB External Hard Drive', sku: 'BOZZ-ELEC-001', price: 850000, stock_qty: 10 },
  },
];

async function confirmDatabaseIdentity(): Promise<void> {
  const result = await prisma.$queryRaw<{ db: string; addr: string | null }[]>`
    SELECT current_database() as db, inet_server_addr()::text as addr
  `;
  const { db, addr } = result[0];
  console.log(`Target database -> current_database: ${db} | server address: ${addr ?? '(local/unix socket)'}`);
}

async function ensureFakestorePlatform(): Promise<string> {
  const existing = await prisma.platforms.findFirst({ where: { platform_name: 'fakestore' } });
  if (existing) return existing.id;
  const created = await prisma.platforms.create({ data: { platform_name: 'fakestore', is_connected: false } });
  console.log(`Baris platform "fakestore" belum ada -- dibuat baru (${created.id}).`);
  return created.id;
}

async function ensureBozzProduct(input: { name: string; sku: string; price: number; stock_qty: number }): Promise<{
  id: string;
  created: boolean;
}> {
  const existing = await prisma.products.findFirst({ where: { sku: input.sku } });
  if (existing) return { id: existing.id, created: false };

  const created = await prisma.products.create({
    data: {
      name: input.name,
      sku: input.sku,
      price: input.price,
      stock_qty: input.stock_qty,
      is_active: true,
      // created_by NULL -- sama seperti produk contoh scripts/seed-sales-inventory.sql,
      // bukan produk buatan test/akun tertentu.
      created_by: null,
    },
  });
  return { id: created.id, created: true };
}

async function main() {
  await confirmDatabaseIdentity();

  const platformId = await ensureFakestorePlatform();
  console.log(`Platform fakestore -> platform_id: ${platformId}\n`);

  const summary: { fakestoreId: string; fakestoreTitle: string; bozzProduct: string; bozzProductId: string; productCreated: boolean; listingAction: 'created' | 'updated' }[] = [];

  for (const mapping of DEMO_MAPPINGS) {
    const product = await ensureBozzProduct(mapping.bozzProduct);

    const existingListing = await prisma.channel_listings.findUnique({
      where: {
        platform_id_external_item_id: { platform_id: platformId, external_item_id: mapping.fakestoreProductId },
      },
    });

    await prisma.channel_listings.upsert({
      where: {
        platform_id_external_item_id: { platform_id: platformId, external_item_id: mapping.fakestoreProductId },
      },
      update: { product_id: product.id },
      create: {
        platform_id: platformId,
        external_item_id: mapping.fakestoreProductId,
        product_id: product.id,
      },
    });

    summary.push({
      fakestoreId: mapping.fakestoreProductId,
      fakestoreTitle: mapping.fakestoreTitle,
      bozzProduct: mapping.bozzProduct.name,
      bozzProductId: product.id,
      productCreated: product.created,
      listingAction: existingListing ? 'updated' : 'created',
    });
  }

  console.log('=== Ringkasan mapping FakeStore <-> BOZZ ===');
  for (const row of summary) {
    console.log(
      `FakeStore #${row.fakestoreId} ("${row.fakestoreTitle}") -> BOZZ "${row.bozzProduct}" (${row.bozzProductId}) ` +
        `[produk ${row.productCreated ? 'BARU dibuat' : 'sudah ada, dipakai ulang'}, listing ${row.listingAction}]`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
