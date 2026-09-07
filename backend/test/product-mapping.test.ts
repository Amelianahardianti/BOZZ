// backend/test/product-mapping.test.ts

// TASK 7B — Phase 1: Core Product Mapping (channel_listings priority,
// products.sku fallback). Lihat laporan audit Task 7 / 7A "Product
// Mapping Architecture Audit" untuk root cause & keputusan arsitektur.
//
// ecommerce-sync/repository.ts SENGAJA TIDAK di-mock di sini -- upsertExternalOrderRow()
// dipanggil langsung, jalan lewat Docker Postgres beneran, supaya test ini
// membuktikan lookup channel_listings/SKU yang SESUNGGUHNYA jalan, bukan
// cuma nge-test ulang mock buatan sendiri. Cuma auth-product/repository
// yang di-mock (pola PERSIS sama seperti tickets.test.ts) -- ticket
// creation di describe kedua butuh findById buat validasi pengepak, tanpa
// perlu baris akun sungguhan di database.

import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { app } from '../src/app';
import { prisma } from '../src/shared/db';
import * as repo from '../src/modules/ecommerce-sync/repository';
import * as authRepo from '../src/modules/auth-product/repository';
import type { User } from '../src/modules/auth-product/repository';
import { ownerToken } from './helpers/auth';
import { pinjamAkun, siapkanKolamAkun } from './helpers/fixtures';

jest.mock('../src/modules/auth-product/repository');

const mockedAuthRepo = authRepo as jest.Mocked<typeof authRepo>;

beforeAll(async () => {
  await siapkanKolamAkun();
});

afterEach(() => {
  jest.resetAllMocks();
});

/** Platform fakestore -- dipakai ulang kalau sudah ada, pola sama seperti bikinExternalOrder() di fixtures.ts. */
async function fakestorePlatformId(): Promise<string> {
  const existing = await prisma.platforms.findFirst({ where: { platform_name: 'fakestore' } });
  if (existing) return existing.id;
  const created = await prisma.platforms.create({ data: { platform_name: 'fakestore', is_connected: false } });
  return created.id;
}

/** Produk BOZZ lewat API asli (created_by ke-set ke akun test, ikut kebersihkan jest.global-setup.ts). */
async function seedProduct(sku?: string): Promise<string> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ name: `TEST-PRODUCT-${randomUUID()}`, sku, price: 10000, stock_qty: 20 });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: pinjamAkun(),
    name: 'Staf Uji',
    email_or_username: 'staf',
    password_hash: '$2a$10$tidakDipakaiLangsungDiTest.................',
    role: 'pengepak',
    phone: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockUsers(...users: User[]): void {
  mockedAuthRepo.findById.mockImplementation(async (id: string) => users.find((u) => u.id === id) ?? null);
}

type IngestOverrides = Partial<Parameters<typeof repo.upsertExternalOrderRow>[0]>;

/** Panggil upsertExternalOrderRow() ASLI -- satu order baru, satu item, per pemanggilan. */
async function ingest(platformId: string, externalItemRef: string, overrides: IngestOverrides = {}) {
  return repo.upsertExternalOrderRow({
    platformId,
    externalOrderId: `TEST-${Date.now()}-${randomUUID()}`,
    customerId: null,
    status: 'new',
    slaType: 'reguler',
    slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    receivedAt: new Date(),
    rawPayload: { test: true },
    items: [{ externalItemRef, itemName: 'Item Uji', qty: 1, unitPrice: 10000 }],
    ...overrides,
  });
}

describe('Product mapping priority: channel_listings dulu, products.sku fallback (Task 7B Phase 1)', () => {
  it('Test 1 -- channel_listings ditemukan -> product_id dari listing, BUKAN dari SKU yang kebetulan sama', async () => {
    const platformId = await fakestorePlatformId();
    const externalItemId = `TEST-CL-${randomUUID()}`;

    const productA = await seedProduct(); // target channel_listings
    const productB = await seedProduct(externalItemId); // SKU-nya SENGAJA disamakan persis dengan externalItemId, buat buktikan channel_listings yang menang, bukan SKU

    await prisma.channel_listings.create({
      data: { platform_id: platformId, external_item_id: externalItemId, product_id: productA },
    });

    const row = await ingest(platformId, externalItemId);

    const items = await prisma.external_order_items.findMany({ where: { external_order_id: row.id } });
    expect(items).toHaveLength(1);
    expect(items[0].product_id).toBe(productA);
    expect(items[0].product_id).not.toBe(productB);
  });

  it('Test 2 -- channel_listings TIDAK ada, SKU cocok -> fallback tetap resolve product_id (regresi mekanisme existing/DEMO-001)', async () => {
    const platformId = await fakestorePlatformId();
    const sku = `TEST-SKU-${randomUUID()}`;
    const productId = await seedProduct(sku);

    const row = await ingest(platformId, sku);

    const items = await prisma.external_order_items.findMany({ where: { external_order_id: row.id } });
    expect(items[0].product_id).toBe(productId);
  });

  it('Test 3 -- tidak ada channel_listings maupun SKU yang cocok -> product_id NULL, order TETAP masuk (bukan error/reject)', async () => {
    const platformId = await fakestorePlatformId();
    const externalItemRef = `TEST-UNMAPPED-${randomUUID()}`;

    const row = await ingest(platformId, externalItemRef);

    expect(row).toBeTruthy();
    const items = await prisma.external_order_items.findMany({ where: { external_order_id: row.id } });
    expect(items).toHaveLength(1);
    expect(items[0].product_id).toBeNull();
    expect(items[0].external_item_ref).toBe(externalItemRef);
  });

  it('channel_listings ketemu TAPI product_id-nya belum di-link (NULL) -> tetap lanjut ke fallback SKU, bukan berhenti di situ', async () => {
    const platformId = await fakestorePlatformId();
    const sku = `TEST-SKU-${randomUUID()}`;
    const productId = await seedProduct(sku);

    // Baris channel_listings dengan product_id NULL SENGAJA dihapus manual
    // di akhir test ini (bukan dibiarkan buat jest.global-setup.ts) --
    // cleanup di sana memfilter `WHERE product_id IN (...)`, dan SQL NULL
    // TIDAK PERNAH match IN (...) apa pun, jadi baris NULL macam ini akan
    // BOCOR permanen kalau tidak dibersihkan sendiri di sini. Baris
    // channel_listings LAIN di file ini semua punya product_id terisi
    // (produk test), jadi ikut kebersihkan otomatis lewat filter itu --
    // cuma kasus product_id NULL yang butuh cleanup eksplisit.
    const listing = await prisma.channel_listings.create({
      data: { platform_id: platformId, external_item_id: sku, product_id: null },
    });

    try {
      const row = await ingest(platformId, sku);

      const items = await prisma.external_order_items.findMany({ where: { external_order_id: row.id } });
      expect(items[0].product_id).toBe(productId);
    } finally {
      await prisma.channel_listings.delete({ where: { id: listing.id } });
    }
  });

  it('platform berbeda dengan external_item_id yang SAMA -> TIDAK saling ketuker (lookup platform-scoped)', async () => {
    const platformId = await fakestorePlatformId();
    const otherPlatform = await prisma.platforms.create({ data: { platform_name: 'tiktok', is_connected: false } });
    const externalItemId = `TEST-XPLAT-${randomUUID()}`;

    const productForFakestore = await seedProduct();
    await prisma.channel_listings.create({
      data: { platform_id: platformId, external_item_id: externalItemId, product_id: productForFakestore },
    });
    // TIDAK ada channel_listings buat platform 'tiktok' dengan external_item_id yang sama.

    const row = await ingest(otherPlatform.id, externalItemId);

    const items = await prisma.external_order_items.findMany({ where: { external_order_id: row.id } });
    // channel_listings platform lain tidak ketemu, dan tidak ada SKU yang cocok -> null,
    // BUKAN salah ketuker ke produk yang sebenarnya milik platform fakestore.
    expect(items[0].product_id).toBeNull();
  });
});

describe('Business-flow: Mapping -> Order Ingestion -> Ticket (Task 7B Section E)', () => {
  it('product ter-mapping via channel_listings -> ticket berhasil dibuat dengan product_id yang benar', async () => {
    const platformId = await fakestorePlatformId();
    const externalItemId = `TEST-FLOW-${randomUUID()}`;
    const productId = await seedProduct();

    await prisma.channel_listings.create({
      data: { platform_id: platformId, external_item_id: externalItemId, product_id: productId },
    });

    const row = await ingest(platformId, externalItemId, {
      items: [{ externalItemRef: externalItemId, itemName: 'Kaos Uji', qty: 2, unitPrice: 50000 }],
    });

    const items = await prisma.external_order_items.findMany({ where: { external_order_id: row.id } });
    expect(items[0].product_id).toBe(productId);

    const pengepak = buildUser();
    mockUsers(pengepak);

    const ticketRes = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        external_order_id: row.id,
        assigned_to_user_id: pengepak.id,
        items: [{ product_id: productId, qty: items[0].qty }],
      });

    expect(ticketRes.status).toBe(201);
    expect(ticketRes.body.items).toHaveLength(1);
    expect(ticketRes.body.items[0].product_id).toBe(productId);
  });
});
