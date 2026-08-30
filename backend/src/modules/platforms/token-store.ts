import { prisma } from "../../db/prisma.client";
import { encrypt, decrypt } from "../../shared/crypto.util";

export const PLATFORM_SHOPEE = "shopee";
export const PLATFORM_TIKTOK = "tiktok";
export const PLATFORM_TOKOPEDIA = "tokopedia";
export const PLATFORM_FAKESTORE = "fakestore";

export interface StoredToken {
  shopIdExternal: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// platform_name tidak unique di skema (cuma check constraint) — ambil baris terbaru,
// sama seperti pola ShopeeToken lama. Cukup untuk single-shop per platform (PoC).
export async function getPlatformRow(platformName: string) {
  return prisma.platforms.findFirst({
    where: { platform_name: platformName },
    orderBy: { updated_at: "desc" },
  });
}

export async function getPlatformToken(platformName: string): Promise<StoredToken | null> {
  const row = await getPlatformRow(platformName);
  if (!row?.access_token_encrypted || !row.refresh_token_encrypted || !row.token_expires_at || !row.shop_id_external) {
    return null;
  }
  return {
    shopIdExternal: row.shop_id_external,
    accessToken: decrypt(row.access_token_encrypted),
    refreshToken: decrypt(row.refresh_token_encrypted),
    expiresAt: row.token_expires_at,
  };
}

export async function upsertPlatformToken(platformName: string, token: StoredToken) {
  const existing = await getPlatformRow(platformName);
  const data = {
    platform_name: platformName,
    shop_id_external: token.shopIdExternal,
    access_token_encrypted: encrypt(token.accessToken),
    refresh_token_encrypted: encrypt(token.refreshToken),
    token_expires_at: token.expiresAt,
    is_connected: true,
  };
  if (existing) {
    return prisma.platforms.update({ where: { id: existing.id }, data });
  }
  return prisma.platforms.create({ data });
}

export async function disconnectPlatform(platformName: string) {
  const existing = await getPlatformRow(platformName);
  if (!existing) return;
  await prisma.platforms.update({
    where: { id: existing.id },
    data: {
      is_connected: false,
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
    },
  });
}

export async function markSyncResult(platformName: string, status: "success" | "failed") {
  const existing = await getPlatformRow(platformName);
  if (!existing) return;
  await prisma.platforms.update({
    where: { id: existing.id },
    data: { last_synced_at: new Date(), last_sync_status: status },
  });
}

export async function listPlatformsSummary() {
  const rows = await prisma.platforms.findMany({ orderBy: { platform_name: "asc" } });
  return rows.map((r) => ({
    platform: r.platform_name,
    connected: r.is_connected,
    shopId: r.shop_id_external,
    lastSyncedAt: r.last_synced_at,
    lastSyncStatus: r.last_sync_status,
  }));
}
