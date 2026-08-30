import "dotenv/config";

export const env = {
  port: Number(process.env.PORT) || 3000,

  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? "",

  // Aktif selama partner key Shopee di-hold / toko TikTok masih "Under review" (SRS: Mock Marketplace Data Layer)
  mockShopee: process.env.MOCK_SHOPEE === "true",
  mockTiktok: process.env.MOCK_TIKTOK === "true",

  shopeePartnerId: process.env.SHOPEE_PARTNER_ID ?? "",
  shopeePartnerKey: process.env.SHOPEE_PARTNER_KEY ?? "",
  shopeeHost: process.env.SHOPEE_HOST ?? "",
  shopeeAuthHost: process.env.SHOPEE_AUTH_HOST ?? "",
  shopeeRedirectUri: process.env.SHOPEE_REDIRECT_URI ?? "",

  tiktokAppKey: process.env.TIKTOK_APP_KEY ?? "",
  tiktokAppSecret: process.env.TIKTOK_APP_SECRET ?? "",
  tiktokServiceId: process.env.TIKTOK_SERVICE_ID ?? "",
  tiktokHost: process.env.TIKTOK_HOST ?? "",
  tiktokAuthHost: process.env.TIKTOK_AUTH_HOST ?? "",
  tiktokRedirectUri: process.env.TIKTOK_REDIRECT_URI ?? "",

  fakestoreRedirectUri: process.env.FAKESTORE_REDIRECT_URI ?? "http://localhost:3000/api/platforms/fakestore/callback",
};
