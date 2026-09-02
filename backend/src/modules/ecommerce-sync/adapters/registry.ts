import type { PlatformAdapter } from '../types';
import { notFound } from '../../../shared/errors';
import { shopeeAdapter } from './shopee';
import { tiktokAdapter } from './tiktok';
import { fakestoreAdapter } from './fakestore';
import { createMockAdapter } from './mock.adapter';

const mockShopee = process.env.MOCK_SHOPEE === 'true';
const mockTiktok = process.env.MOCK_TIKTOK === 'true';

export const platformAdapters: Record<string, PlatformAdapter> = {
  shopee: mockShopee ? createMockAdapter('shopee', process.env.SHOPEE_REDIRECT_URI ?? '') : shopeeAdapter,
  tiktok: mockTiktok ? createMockAdapter('tiktok', process.env.TIKTOK_REDIRECT_URI ?? '') : tiktokAdapter,
  // Selalu aktif — tidak butuh credential sama sekali, dipakai sebagai
  // channel demo/multichannel (bukan cuma mock test) selagi Shopee/TikTok
  // menunggu credential asli. Sudah terdaftar di PlatformParam enum
  // (contracts/api.yaml).
  fakestore: fakestoreAdapter,
};

/** Dipakai /api/platforms buat nandain platform yang belum ada credential asli. */
export function isPlatformConfigured(platformName: string): boolean {
  if (platformName === 'fakestore') return true;
  if (platformName === 'shopee') return mockShopee || Boolean(process.env.SHOPEE_PARTNER_ID);
  if (platformName === 'tiktok') return mockTiktok || Boolean(process.env.TIKTOK_APP_KEY);
  return false;
}

export function getAdapter(platformName: string): PlatformAdapter {
  const adapter = platformAdapters[platformName];
  // AppError (bukan Error polos) -- supaya lewat error handler pusat jadi
  // 404 yang jelas ("platform tidak dikenal"), bukan 500 generik yang
  // menyembunyikan pesan aslinya (Step 8 hardening).
  if (!adapter) throw notFound(`Platform "${platformName}" tidak dikenal.`);
  return adapter;
}
