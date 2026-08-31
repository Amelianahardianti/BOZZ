// backend/src/modules/ecommerce-sync/adapters/mock.adapter.ts

// Mock Marketplace Data Layer — dipakai selagi Shopee partner key & toko
// TikTok belum tersedia (di-toggle lewat MOCK_SHOPEE/MOCK_TIKTOK di .env).
// "Auth"-nya self-referencing (redirect ke callback sendiri dengan code
// palsu) supaya seluruh alur connect->callback->sync tetap teruji nyata,
// cuma sumber datanya yang difiksasi.

import type { PlatformAdapter, NormalizedOrder } from '../types';
import { upsertPlatformToken } from '../repository';

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
      items: [{ itemName: 'Kaos Polos Hitam L', qty: 2, unitPrice: 75000 }],
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

export function createMockAdapter(platformName: string, redirectUri: string): PlatformAdapter {
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
  };
}
