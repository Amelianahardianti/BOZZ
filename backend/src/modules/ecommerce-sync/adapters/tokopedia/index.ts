// backend/src/modules/ecommerce-sync/adapters/tokopedia/index.ts

// Tokopedia Mock Adapter — BUKAN integrasi produksi. Tidak ada HTTP
// request ke Tokopedia sungguhan, tidak butuh App ID/App Secret/webhook
// Tokopedia asli. Tujuannya membuktikan arsitektur adapter ini benar-benar
// modular (menambah 1 platform baru = 1 file baru yang memenuhi
// PlatformAdapter, tanpa menyentuh service.ts/repository.ts) — bukan
// membangun koneksi ke API Tokopedia yang sebenarnya (credential produksi
// belum tersedia, di luar scope prototype ini).
//
// Polanya meniru adapters/mock.adapter.ts (auth self-referencing, fixture
// order tetap) tapi jadi file sendiri -- SRS menyebut Tokopedia eksplisit
// sebagai salah satu platform yang didukung (§1.2, §2.2), jadi layak
// punya identitas adapter sendiri, bukan cuma dipanggil lewat
// createMockAdapter('tokopedia', ...) generik.

import type { PlatformAdapter, NormalizedOrder } from '../../types';
import { upsertPlatformToken } from '../../repository';

const PLATFORM_NAME = 'tokopedia';
const SHOP_ID = 'MOCK-SHOP-TOKOPEDIA';

function redirectUri(): string {
  return process.env.TOKOPEDIA_REDIRECT_URI || 'http://localhost:3000/api/platforms/tokopedia/callback';
}

function buildFixtureOrders(): NormalizedOrder[] {
  return [
    {
      externalOrderId: 'MOCK-TOKOPEDIA-001',
      status: 'new',
      totalAmount: 210000,
      buyerUsername: 'siti_rahma',
      shippingCarrier: 'GrabExpress Instant',
      rawPayload: { mock: true, platform: PLATFORM_NAME, note: 'order baru' },
      items: [{ itemName: 'Totebag Kanvas', qty: 3, unitPrice: 70000 }],
    },
    {
      externalOrderId: 'MOCK-TOKOPEDIA-002',
      status: 'processing',
      totalAmount: 95000,
      buyerUsername: 'agus_pratama',
      rawPayload: { mock: true, platform: PLATFORM_NAME, note: 'sedang diproses' },
      items: [{ itemName: 'Mug Custom', qty: 1, unitPrice: 95000 }],
    },
  ];
}

// "Status order" & "stok" versi mock, di memori -- meniru pola yang sama
// dengan mock.adapter.ts createMockAdapter(). Bukan panggilan API
// sungguhan ke Tokopedia.
const mockOrderStatus = new Map<string, string>();
const mockStock = new Map<string, number>();

export const tokopediaAdapter: PlatformAdapter = {
  name: PLATFORM_NAME,

  buildAuthorizationUrl: () => `${redirectUri()}?code=MOCK_CODE&shop_id=${SHOP_ID}`,

  exchangeCodeForToken: async (_code, shopIdExternal) => {
    const shopId = shopIdExternal ?? SHOP_ID;
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    await upsertPlatformToken(PLATFORM_NAME, {
      shopIdExternal: shopId,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt,
    });
    return { shopIdExternal: shopId, expiresAt };
  },

  getValidAccessToken: async () => ({ shopIdExternal: SHOP_ID, accessToken: 'mock-access-token' }),

  fetchRecentOrders: async () => buildFixtureOrders(),

  updateOrderStatusOnPlatform: async (_creds, externalOrderId, status) => {
    mockOrderStatus.set(externalOrderId, status);
  },

  updateStockOnPlatform: async (_creds, productId, stockAfter) => {
    mockStock.set(productId, stockAfter);
  },
};

/** Cuma buat test/inspeksi -- bukan bagian kontrak PlatformAdapter. */
export function getMockOrderStatus(externalOrderId: string): string | undefined {
  return mockOrderStatus.get(externalOrderId);
}

/** Cuma buat test/inspeksi -- bukan bagian kontrak PlatformAdapter. */
export function getMockStock(productId: string): number | undefined {
  return mockStock.get(productId);
}
