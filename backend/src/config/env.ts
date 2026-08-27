import "dotenv/config";

export const env = {
  port: Number(process.env.PORT) || 3000,
  shopeePartnerId: process.env.SHOPEE_PARTNER_ID ?? "",
  shopeePartnerKey: process.env.SHOPEE_PARTNER_KEY ?? "",
  shopeeHost: process.env.SHOPEE_HOST ?? "",
  shopeeAuthHost: process.env.SHOPEE_AUTH_HOST ?? "",
  shopeeRedirectUri: process.env.SHOPEE_REDIRECT_URI ?? "",
};
