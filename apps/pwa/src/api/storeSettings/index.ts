import { readStoredSession } from '../../shell/auth/auth-context'
import { apiRequest } from '../client'

/** Cerminan #/components/schemas/StoreSettings di contracts/api.yaml. */
export interface StoreSettings {
  id: string
  business_name: string
  address: string | null
  phone: string | null
  receipt_footer_note: string | null
  logo_url: string | null
  updated_by: string | null
  updated_at: string
}

export interface UpdateStoreSettingsInput {
  business_name?: string
  address?: string
  phone?: string
  receipt_footer_note?: string
  logo_url?: string
}

function requireToken(): string {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login.')
  }
  return session.token
}

/** GET /api/store-settings -- semua role login boleh baca (dibutuhin buat header struk, FR-SI-05). */
export async function fetchStoreSettings(): Promise<StoreSettings> {
  return apiRequest<StoreSettings>('/store-settings', { token: requireToken() })
}

/** PATCH /api/store-settings -- Owner. */
export async function updateStoreSettings(changes: UpdateStoreSettingsInput): Promise<StoreSettings> {
  return apiRequest<StoreSettings>('/store-settings', { method: 'PATCH', body: changes, token: requireToken() })
}
