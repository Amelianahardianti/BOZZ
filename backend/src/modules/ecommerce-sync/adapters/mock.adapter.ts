// backend/src/modules/ecommerce-sync/adapters/mock.adapter.ts

// Mock Marketplace Data Layer — dipakai selagi Shopee partner key & toko
// TikTok belum tersedia (di-toggle lewat MOCK_SHOPEE/MOCK_TIKTOK di .env).
// "Auth"-nya self-referencing (redirect ke callback sendiri dengan code
// palsu) supaya seluruh alur connect->callback->sync tetap teruji nyata,
// cuma sumber datanya yang difiksasi.

import { createHmac } from 'crypto';
import type { PlatformAdapter, NormalizedOrder } from '../types';
import { upsertPlatformToken } from '../repository';

// ---------------------------------------------------------------------
// Webhook demo (External E-commerce Order Simulator) -- dipakai bareng
// createMockAdapter() (Shopee Mock, TikTok Mock) DAN diimpor ulang oleh
// adapters/tokopedia/index.ts, supaya logic verifikasi+normalisasi cuma
// ada SATU tempat, bukan diduplikasi 3x. Polanya niru
// adapters/tiktok/index.ts (HMAC-SHA256, header Authorization) yang
// SUDAH ada & teruji -- bedanya cuma kunci HMAC-nya satu secret bersama
// (bukan App Key/Secret per-platform sungguhan, karena ini simulator,
// bukan kredensial marketplace asli).
// ---------------------------------------------------------------------

function demoWebhookSecret(): string {
  return process.env.MOCK_WEBHOOK_SECRET || 'dev-mock-webhook-secret-ganti-di-production';
}

/** Bentuk body yang dikirim External E-commerce Order Simulator. */
export interface DemoWebhookPayload {
  external_order_id: string;
  buyer_username: string;
  items: { external_item_id: string; item_name: string; qty: number; unit_price: number }[];
}

/**
 * Verifikasi signature webhook demo -- HMAC-SHA256(secret, platformName + rawBody),
 * dikirim simulator di header Authorization. `platformName` ikut masuk
 * campuran supaya signature buat "shopee" tidak valid buat "tokopedia"
 * walau body-nya persis sama.
 */
export function verifyDemoWebhookSignature(
  platformName: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
): boolean {
  const signatureHeader = headers['authorization'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) return false;
  const expected = createHmac('sha256', demoWebhookSecret()).update(platformName + rawBody).digest('hex');
  return signature === expected;
}

/**
 * Ubah payload simulator jadi NormalizedOrder. `external_item_id` dikirim
 * apa adanya sebagai `externalItemRef` -- product_id-nya SENGAJA TIDAK
 * diisi di sini, itu tanggung jawab upsertExternalOrderRow() (mapping
 * channel_listings / fallback SKU, Task 7B) yang jalan setelahnya.
 * Simulator tidak pernah tahu/kirim internal product_id BOZZ.
 */
export function normalizeDemoWebhookPayload(payload: unknown): NormalizedOrder | null {
  const body = payload as Partial<DemoWebhookPayload>;
  if (!body?.external_order_id || !Array.isArray(body.items) || body.items.length === 0) return null;

  const items = body.items
    .filter((item): item is DemoWebhookPayload['items'][number] => Boolean(item?.external_item_id && item.qty > 0))
    .map((item) => ({
      externalItemRef: item.external_item_id,
      itemName: item.item_name,
      qty: item.qty,
      unitPrice: item.unit_price,
    }));
  if (items.length === 0) return null;

  return {
    externalOrderId: body.external_order_id,
    status: 'new',
    totalAmount: items.reduce((sum, i) => sum + (i.unitPrice ?? 0) * i.qty, 0),
    buyerUsername: body.buyer_username,
    rawPayload: body,
    items,
  };
}

function buildFixtures(platformName: string): NormalizedOrder[] {
  const prefix = platformName.toUpperCase();
  return [
    {
      externalOrderId: `MOCK-${prefix}-001`,
      status: 'new',
      totalAmount: 150000,
      buyerUsername: 'rina_amelia',
      shippingCarrier: 'GrabExpress Instant',
      rawPayload: { mock: true, platform: platformName, note: 'order baru' },
      // externalItemRef 'DEMO-001' SENGAJA ditambah -- data demo minimal buat
      // membuktikan SKU matching (lihat repository.ts upsertExternalOrderRow)
      // beneran jalan end-to-end, sesuai laporan audit "Order -> Ticket".
      // Cocokkan dengan 1 produk internal ber-SKU 'DEMO-001'.
      items: [{ itemName: 'Kaos Polos Hitam L', qty: 2, unitPrice: 75000, externalItemRef: 'DEMO-001' }],
    },
    {
      externalOrderId: `MOCK-${prefix}-002`,
      status: 'shipped',
      totalAmount: 320000,
      buyerUsername: 'fajar_nugroho',
      rawPayload: { mock: true, platform: platformName, note: 'sudah dikirim' },
      items: [{ itemName: 'Sepatu Sneakers 42', qty: 1, unitPrice: 320000 }],
    },
    {
      externalOrderId: `MOCK-${prefix}-003`,
      status: 'completed',
      totalAmount: 75000,
      buyerUsername: 'budi_santoso',
      shippingCarrier: 'JNE Same Day',
      rawPayload: { mock: true, platform: platformName, note: 'selesai' },
      items: [{ itemName: 'Tumbler 500ml', qty: 1, unitPrice: 75000 }],
    },
  ];
}

export interface MockAdapter extends PlatformAdapter {
  /** Cuma buat test/inspeksi -- bukan bagian kontrak PlatformAdapter. */
  getMockStock(productId: string): number | undefined;
}

export function createMockAdapter(platformName: string, redirectUri: string): MockAdapter {
  // "Database stok" versi mock, di memori -- SRS §8.2 tidak minta ini
  // benar-benar sampai ke Shopee/TikTok sungguhan, cukup buktikan
  // pipeline event -> adapter jalan.
  const mockStock = new Map<string, number>();

  return {
    name: platformName,

    buildAuthorizationUrl: () => `${redirectUri}?code=MOCK_CODE&shop_id=MOCK-SHOP-${platformName.toUpperCase()}`,

    exchangeCodeForToken: async (_code, shopIdExternal) => {
      const shopId = shopIdExternal ?? `MOCK-SHOP-${platformName.toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
      await upsertPlatformToken(platformName, {
        shopIdExternal: shopId,
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresAt,
      });
      return { shopIdExternal: shopId, expiresAt };
    },

    getValidAccessToken: async () => ({
      shopIdExternal: `MOCK-SHOP-${platformName.toUpperCase()}`,
      accessToken: 'mock-access-token',
    }),

    fetchRecentOrders: async () => buildFixtures(platformName),

    updateStockOnPlatform: async (_creds, productId, stockAfter) => {
      mockStock.set(productId, stockAfter);
    },

    getMockStock: (productId) => mockStock.get(productId),

    verifyWebhookSignature: (rawBody, headers) => verifyDemoWebhookSignature(platformName, rawBody, headers),

    normalizeWebhookPayload: (payload) => normalizeDemoWebhookPayload(payload),
  };
}
