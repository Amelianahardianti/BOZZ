import { env } from "../../config/env";
import type { PlatformAdapter, NormalizedOrder } from "../platforms/platform-adapter.types";
import { upsertPlatformToken, getPlatformToken, PLATFORM_FAKESTORE } from "../platforms/token-store";
import { getProducts, getCarts, getUser } from "./fakestore-api.client";

const MOCK_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export const fakestoreAdapter: PlatformAdapter = {
  name: PLATFORM_FAKESTORE,

  // FakeStoreAPI publik, tanpa OAuth — authorize link nunjuk balik ke callback kita
  // sendiri (bukan situs pihak ketiga) karena memang tidak ada langkah otorisasi asli
  // yang perlu dilewati. `platforms` row tetap ditulis lewat jalur yang sama seperti
  // connector ber-OAuth, jadi "store bisa connect" tetap teruji end-to-end.
  buildAuthorizationUrl: () => {
    const url = new URL(env.fakestoreRedirectUri);
    url.searchParams.set("code", "FAKESTORE_NO_AUTH_REQUIRED");
    url.searchParams.set("shop_id", "fakestore-demo-shop");
    return url.toString();
  },

  exchangeCodeForToken: async (_code, shopIdExternal) => {
    const expiresAt = new Date(Date.now() + MOCK_TOKEN_TTL_MS);
    const shopId = shopIdExternal ?? "fakestore-demo-shop";
    await upsertPlatformToken(PLATFORM_FAKESTORE, {
      shopIdExternal: shopId,
      accessToken: "fakestore-no-auth-required",
      refreshToken: "fakestore-no-auth-required",
      expiresAt,
    });
    return { shopIdExternal: shopId, expiresAt };
  },

  getValidAccessToken: async () => {
    const token = await getPlatformToken(PLATFORM_FAKESTORE);
    if (!token) throw new Error("FakeStore connector belum di-connect — hit connect/callback dulu");
    return { shopIdExternal: token.shopIdExternal, accessToken: token.accessToken };
  },

  // sinceSeconds sengaja diabaikan: data cart FakeStoreAPI bertanggal historis tetap
  // (2019-2020), bukan real-time — filter "N hari terakhir" justru bikin hasilnya
  // selalu kosong. Semua cart yang tersedia ditarik, sesuai sifatnya sebagai data demo.
  fetchRecentOrders: async (): Promise<NormalizedOrder[]> => {
    const [products, carts] = await Promise.all([getProducts(), getCarts()]);
    const productById = new Map(products.map((p) => [p.id, p]));

    const userCache = new Map<number, string | undefined>();
    async function usernameFor(userId: number): Promise<string | undefined> {
      if (userCache.has(userId)) return userCache.get(userId);
      const user = await getUser(userId);
      userCache.set(userId, user?.username);
      return user?.username;
    }

    const orders: NormalizedOrder[] = [];
    for (const cart of carts) {
      const buyerUsername = await usernameFor(cart.userId);
      const items = cart.products.map((item) => {
        const product = productById.get(item.productId);
        return {
          externalItemRef: String(item.productId),
          itemName: product?.title ?? `Product #${item.productId}`,
          qty: item.quantity,
          unitPrice: product?.price,
        };
      });
      const totalAmount = items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.qty, 0);

      orders.push({
        externalOrderId: `CART-${cart.id}`,
        // FakeStoreAPI carts tidak punya field status/lifecycle sama sekali — dipetakan
        // rata ke "new" apa adanya, bukan dipalsuin jadi shipped/completed.
        status: "new",
        externalStatusRaw: undefined,
        totalAmount,
        currency: "USD",
        buyerUsername,
        rawPayload: cart,
        items,
      });
    }

    return orders;
  },
};
