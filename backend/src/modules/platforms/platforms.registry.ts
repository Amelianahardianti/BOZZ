import type { PlatformAdapter } from "./platform-adapter.types";
import { env } from "../../config/env";
import { shopeeAdapter } from "../shopee/shopee.adapter";
import { tiktokAdapter } from "../tiktok/tiktok.adapter";
import { fakestoreAdapter } from "../fakestore/fakestore.adapter";
import { createMockAdapter } from "./mock-adapter.factory";

export const platformAdapters: Record<string, PlatformAdapter> = {
  shopee: env.mockShopee ? createMockAdapter("shopee", env.shopeeRedirectUri) : shopeeAdapter,
  tiktok: env.mockTiktok ? createMockAdapter("tiktok", env.tiktokRedirectUri) : tiktokAdapter,
  // Selalu aktif — tidak butuh credential sama sekali, dipakai buat pembuktian
  // pipeline omnichannel selagi Shopee/TikTok masih menunggu credential asli.
  fakestore: fakestoreAdapter,
};

// Dipakai /api/platforms buat nandain Shopee/TikTok sebagai NOT_CONFIGURED di dashboard
// begitu credential asli belum diisi — tanpa perlu ubah kode adapter-nya sama sekali.
export function isPlatformConfigured(platformName: string): boolean {
  if (platformName === "fakestore") return true;
  if (platformName === "shopee") return env.mockShopee || Boolean(env.shopeePartnerId);
  if (platformName === "tiktok") return env.mockTiktok || Boolean(env.tiktokAppKey);
  return false;
}

export function getAdapter(platformName: string): PlatformAdapter {
  const adapter = platformAdapters[platformName];
  if (!adapter) throw new Error(`Unknown platform "${platformName}"`);
  return adapter;
}
