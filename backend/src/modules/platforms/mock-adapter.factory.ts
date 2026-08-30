import type { PlatformAdapter } from "./platform-adapter.types";
import { upsertPlatformToken, getPlatformToken } from "./token-store";
import { mockFixtures } from "./mock-fixtures";

const MOCK_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Drop-in PlatformAdapter yang tidak memanggil API eksternal sama sekali — dipakai
 * selagi partner key Shopee di-hold / toko TikTok masih "Under review". Alur
 * connect -> callback -> sync tetap sama persis (lewat platforms.routes yang sudah
 * ada), cuma authorize URL-nya nunjuk balik ke callback kita sendiri dengan kode
 * palsu, jadi seluruh pipeline (dedup, SLA, event, customer matching) kena-test asli.
 */
export function createMockAdapter(platformName: string, callbackUrl: string): PlatformAdapter {
  return {
    name: platformName,

    buildAuthorizationUrl: () => {
      const url = new URL(callbackUrl);
      url.searchParams.set("code", "MOCK_CODE");
      url.searchParams.set("shop_id", `MOCK-SHOP-${platformName.toUpperCase()}`);
      return url.toString();
    },

    exchangeCodeForToken: async (_code, shopIdExternal) => {
      const expiresAt = new Date(Date.now() + MOCK_TOKEN_TTL_MS);
      await upsertPlatformToken(platformName, {
        shopIdExternal: shopIdExternal ?? `MOCK-SHOP-${platformName.toUpperCase()}`,
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresAt,
      });
      return { shopIdExternal: shopIdExternal ?? `MOCK-SHOP-${platformName.toUpperCase()}`, expiresAt };
    },

    getValidAccessToken: async () => {
      const token = await getPlatformToken(platformName);
      if (!token) throw new Error(`No mock ${platformName} shop connected yet — hit connect/callback first`);
      return { shopIdExternal: token.shopIdExternal, accessToken: token.accessToken };
    },

    fetchRecentOrders: async () => mockFixtures[platformName] ?? [],
  };
}
