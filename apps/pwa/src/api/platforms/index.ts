import { readStoredSession } from '../../shell/auth/auth-context'
import { apiRequest } from '../client'

export type PlatformName = 'shopee' | 'tiktok' | 'fakestore'

/** Cerminan #/components/schemas/Platform di contracts/api.yaml. */
export interface Platform {
  id: string | null
  platform_name: PlatformName
  shop_id_external: string | null
  token_expires_at: string | null
  is_connected: boolean
  last_synced_at: string | null
  last_sync_status: 'success' | 'failed' | null
  /** true kalau adapter platform ini punya kredensial (mock/env) buat konek beneran. */
  configured: boolean
}

function requireToken(): string {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login.')
  }
  return session.token
}

/** GET /api/platforms -- Owner. */
export async function fetchPlatforms(): Promise<Platform[]> {
  return apiRequest<Platform[]>('/platforms', { token: requireToken() })
}

/**
 * POST /api/platforms/:platform/connect -- Owner. `oauth_code` WAJIB
 * diisi backend (lihat service.ts), tapi di mode mock/fake (belum
 * pakai e-commerce asli, sesuai scope Fase 11 sekarang) adapter-nya
 * gak validasi isi kodenya sama sekali -- jadi string placeholder ini
 * cukup. Begitu integrasi Shopee/TikTok asli jadi, tombol ini WAJIB
 * diganti alur OAuth redirect beneran (lihat GET
 * /platforms/:platform/authorize-url di backend buat referensinya).
 */
export async function connectPlatform(platformName: PlatformName): Promise<Platform> {
  return apiRequest<Platform>(`/platforms/${platformName}/connect`, {
    method: 'POST',
    body: { oauth_code: 'MOCK_CODE' },
    token: requireToken(),
  })
}

/** POST /api/platforms/:platform/disconnect -- Owner. */
export async function disconnectPlatform(platformName: PlatformName): Promise<Platform> {
  return apiRequest<Platform>(`/platforms/${platformName}/disconnect`, { method: 'POST', token: requireToken() })
}

/** POST /api/platforms/:platform/sync -- Owner. Balas 202 duluan, sync jalan di background di backend. */
export async function syncPlatform(platformName: PlatformName): Promise<Platform> {
  return apiRequest<Platform>(`/platforms/${platformName}/sync`, { method: 'POST', token: requireToken() })
}
