// backend/scripts/setup-multichannel-demo-mapping.ts
//
// One-off, manual setup -- BUKAN endpoint, BUKAN dijalankan otomatis.
// Bagian dari "External E-commerce Order Simulator" (Option B --
// requirement §3, §20): satu produk BOZZ dijual di beberapa channel.
//
// BEDA dari scripts/setup-fakestore-demo-mapping.ts: script itu MEMBUAT
// produk BOZZ baru kalau belum ada. Script ini SENGAJA TIDAK -- cuma
// mengambil produk yang SUDAH terhubung ke FakeStore (listing yang sudah
// ada), lalu menambah mapping produk YANG SAMA ke Shopee/Tokopedia/TikTok.
// Tidak ada produk baru, tidak ada nama produk yang di-hardcode di sini
// -- semua diambil dinamis dari channel_listings+products yang sudah ada.
//
// external_item_id untuk platform baru dibuat deterministik dari SKU
// produk yang sudah ada: "<PREFIX>-<sku>" (mis. SKU "BOZZ-BAG-001" ->
// Shopee "SHP-BOZZ-BAG-001"). Ini bukan format resmi marketplace mana pun
// -- cuma ID unik yang bisa ditelusuri balik ke SKU aslinya, cukup buat
// demo (channel_listings.external_item_id cuma varchar(100) tanpa
// constraint format, lihat schema.prisma).
//
// Aman dijalankan berkali-kali (idempotent) -- upsert() by
// (platform_id, external_item_id), sama seperti setup-fakestore-demo-mapping.ts.
//
// Jalankan manual sekali (target: DATABASE_URL di .env -- Supabase dev,
// BUKAN .env.test/Docker): npx ts-node scripts/setup-multichannel-demo-mapping.ts

import 'dotenv/config';
import { prisma } from '../src/shared/db';

const TARGET_PLATFORMS: { platformName: string; prefix: string }[] = [
  { platformName: 'shopee', prefix: 'SHP' },
  { platformName: 'tokopedia', prefix: 'TKP' },
  { platformName: 'tiktok', prefix: 'TTK' },
];

async function confirmDatabaseIdentity(): Promise<void> {
  const result = await prisma.$queryRaw<{ db: string; addr: string | null }[]>`
    SELECT current_database() as db, inet_server_addr()::text as addr
  `;
  const { db, addr } = result[0];
  console.log(`Target database -> current_database: ${db} | server address: ${addr ?? '(local/unix socket)'}`);
}

async function ensurePlatformRow(platformName: string): Promise<string> {
  const existing = await prisma.platforms.findFirst({ where: { platform_name: platformName } });
  if (existing) return existing.id;
  // is_connected TETAP false di sini -- "connect" itu keputusan presenter
  // lewat PWA (flow asli, sudah teruji), bukan sesuatu yang dipalsukan
  // script setup ini.
  const created = await prisma.platforms.create({ data: { platform_name: platformName, is_connected: false } });
  console.log(`Baris platform "${platformName}" belum ada -- dibuat baru (${created.id}, is_connected: false).`);
  return created.id;
}

async function main() {
  await confirmDatabaseIdentity();

  // Sumber produk: SEMUA produk yang sudah punya listing FakeStore
  // (dibuat scripts/setup-fakestore-demo-mapping.ts) -- bukan dipilih
  // dari nama, murni dari data yang sudah ada.
  const fakestoreListings = await prisma.channel_listings.findMany({
    where: { platforms: { platform_name: 'fakestore' }, product_id: { not: null } },
    include: { products: true },
  });

  if (fakestoreListings.length === 0) {
    console.log(
      'Tidak ada channel_listings ke FakeStore sama sekali -- jalankan scripts/setup-fakestore-demo-mapping.ts dulu.'
    );
    await prisma.$disconnect();
    return;
  }

  console.log(`Produk sumber (sudah punya listing FakeStore): ${fakestoreListings.length}\n`);

  const summary: { platform: string; product: string; sku: string; externalItemId: string; action: 'created' | 'updated' }[] = [];

  for (const target of TARGET_PLATFORMS) {
    const platformId = await ensurePlatformRow(target.platformName);

    for (const listing of fakestoreListings) {
      const product = listing.products!;
      if (!product.sku) {
        console.log(`Lewati "${product.name}" -- tidak punya SKU, tidak bisa dibuatkan external_item_id deterministik.`);
        continue;
      }

      const externalItemId = `${target.prefix}-${product.sku}`;
      const existingListing = await prisma.channel_listings.findUnique({
        where: { platform_id_external_item_id: { platform_id: platformId, external_item_id: externalItemId } },
      });

      await prisma.channel_listings.upsert({
        where: { platform_id_external_item_id: { platform_id: platformId, external_item_id: externalItemId } },
        update: { product_id: product.id },
        create: { platform_id: platformId, external_item_id: externalItemId, product_id: product.id },
      });

      summary.push({
        platform: target.platformName,
        product: product.name,
        sku: product.sku,
        externalItemId,
        action: existingListing ? 'updated' : 'created',
      });
    }
  }

  console.log('\n=== Ringkasan mapping multi-channel ===');
  for (const row of summary) {
    console.log(`[${row.platform}] ${row.product} (SKU ${row.sku}) -> external_item_id "${row.externalItemId}" [${row.action}]`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
