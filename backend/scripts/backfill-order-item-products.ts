// backend/scripts/backfill-order-item-products.ts
//
// One-off, manual backfill -- BUKAN endpoint, BUKAN dijalankan otomatis.
// Lihat laporan audit "Order -> Ticket" (product_id selalu NULL di
// external_order_items). Setelah SKU-matching ditambahkan ke
// upsertExternalOrderRow (repository.ts), order BARU yang masuk otomatis
// ter-mapping -- tapi order LAMA yang sudah terlanjur ada di DB dengan
// product_id NULL tidak ikut diproses ulang (insert lama tidak dipanggil
// lagi). Script ini mengisi product_id untuk baris LAMA itu saja, dengan
// aturan yang SAMA PERSIS seperti insert baru: exact match
// external_item_ref -> products.sku, TIDAK overwrite baris yang sudah
// punya product_id, TIDAK menyentuh kolom lain / order lain sama sekali.
//
// Jalankan manual sekali: npx ts-node scripts/backfill-order-item-products.ts

import { prisma } from '../src/shared/db';

async function main() {
  const candidates = await prisma.external_order_items.findMany({
    where: { product_id: null, external_item_ref: { not: null } },
    select: { id: true, external_order_id: true, external_item_ref: true, item_name_snapshot: true },
  });

  console.log(`Baris kandidat (product_id NULL, external_item_ref ada): ${candidates.length}`);

  let updated = 0;
  for (const item of candidates) {
    const product = await prisma.products.findFirst({
      where: { sku: item.external_item_ref as string },
      select: { id: true, sku: true, name: true },
    });
    if (!product) continue;

    // Guard tambahan: pastikan masih NULL saat ini juga (hindari race kalau
    // ada proses lain yang barusan nulis product_id di antara SELECT & UPDATE
    // di atas) -- update HANYA baris ini, HANYA kolom product_id.
    const result = await prisma.external_order_items.updateMany({
      where: { id: item.id, product_id: null },
      data: { product_id: product.id },
    });
    if (result.count > 0) {
      updated += 1;
      console.log(
        `MATCH  order_item=${item.id} sku="${item.external_item_ref}" -> product="${product.name}" (${product.id})`
      );
    }
  }

  console.log(`Selesai. ${updated} / ${candidates.length} baris ter-update.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
