// FakeStoreAPI connector — bukti konsep omnichannel yang jalan tanpa
// credential marketplace produksi (blocked di Shopee/TikTok). Ini API HTTPS
// publik asli (fakestoreapi.com), bukan fixture statis: fetchRecentOrders
// beneran melakukan network round-trip, normalisasi, lalu masuk pipeline
// yang sama persis dengan adapter Shopee/TikTok.

import type { PlatformAdapter, NormalizedOrder } from '../../types';
import { upsertPlatformToken } from '../../repository';
import { getCarts, getProducts, getUser, putCart, type FakeStoreCart } from './api.client';

const PLATFORM_NAME = 'fakestore';
const SHOP_ID = 'fakestore-demo-shop';

function redirectUri(): string {
  return process.env.FAKESTORE_REDIRECT_URI || 'http://localhost:3000/api/platforms/fakestore/callback';
}

async function mapCart(cart: FakeStoreCart, productPrice: Map<number, { title: string; price: number }>): Promise<NormalizedOrder> {
  const user = await getUser(cart.userId);
  const items = cart.products.map((p) => {
    const product = productPrice.get(p.productId);
    return {
      externalItemRef: String(p.productId),
      itemName: product?.title ?? `Produk #${p.productId}`,
      qty: p.quantity,
      unitPrice: product?.price,
    };
  });
  const totalAmount = items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.qty, 0);

  return {
    externalOrderId: `CART-${cart.id}`,
    // FakeStoreAPI tidak punya konsep status order sama sekali — di-map
    // konstan ke "new" apa adanya, bukan dipalsuin jadi shipped/completed.
    status: 'new',
    totalAmount,
    buyerUsername: user?.username,
    rawPayload: cart,
    items,
  };
}

export const fakestoreAdapter: PlatformAdapter = {
  name: PLATFORM_NAME,

  buildAuthorizationUrl: () => `${redirectUri()}?code=NO_AUTH_NEEDED&shop_id=${SHOP_ID}`,

  exchangeCodeForToken: async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await upsertPlatformToken(PLATFORM_NAME, {
      shopIdExternal: SHOP_ID,
      accessToken: 'no-auth-needed',
      refreshToken: 'no-auth-needed',
      expiresAt,
    });
    return { shopIdExternal: SHOP_ID, expiresAt };
  },

  getValidAccessToken: async () => ({ shopIdExternal: SHOP_ID, accessToken: 'no-auth-needed' }),

  fetchRecentOrders: async () => {
    const [carts, products] = await Promise.all([getCarts(), getProducts()]);
    const productPrice = new Map(products.map((p) => [p.id, { title: p.title, price: p.price }]));
    return Promise.all(carts.map((cart) => mapCart(cart, productPrice)));
  },

  // FakeStoreAPI tidak punya konsep/persistensi status order sama sekali
  // (lihat komentar di mapCart di atas) -- PUT /carts/:id ini CUMA
  // simulator outbound status sync, buat membuktikan pipeline forward
  // (service.ts forwardStatusToPlatform -> adapter -> HTTP keluar) beneran
  // jalan end-to-end. Bukan integrasi status yang valid: FakeStoreAPI tidak
  // memvalidasi atau menyimpan body ini.
  updateOrderStatusOnPlatform: async (_creds, externalOrderId, status) => {
    const cartId = Number(externalOrderId.replace('CART-', ''));
    await putCart(cartId, { status });
  },
};
