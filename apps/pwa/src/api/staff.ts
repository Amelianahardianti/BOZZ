import { readStoredSession } from '../shell/auth/auth-context'
import type { AppRole } from '../shell/routing/routes'
import { apiRequest } from './client'

/** Cerminan #/components/schemas/User (minus password_hash) di contracts/api.yaml. */
export interface Staff {
  id: string
  name: string
  email_or_username: string
  role: AppRole
  phone: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

interface PaginatedStaff {
  data: Staff[]
  page: number
  limit: number
  total: number
}

function requireToken(): string {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login -- halaman Staf wajib login sebagai Owner.')
  }
  return session.token
}

/** GET /api/staff -- Owner. */
export async function fetchStaff(): Promise<Staff[]> {
  const result = await apiRequest<PaginatedStaff>('/staff', { token: requireToken() })
  return result.data
}

export interface CreateStaffInput {
  name: string
  email_or_username: string
  password: string
  role: 'kasir' | 'pengepak'
  phone?: string
}

/** POST /api/staff -- Owner. Role cuma boleh kasir/pengepak (owner ditolak backend). */
export async function createStaff(input: CreateStaffInput): Promise<Staff> {
  return apiRequest<Staff>('/staff', { method: 'POST', body: input, token: requireToken() })
}

export interface UpdateStaffInput {
  name?: string
  email_or_username?: string
  role?: 'kasir' | 'pengepak'
  phone?: string
}

/** PATCH /api/staff/:id -- Owner. */
export async function updateStaff(id: string, changes: UpdateStaffInput): Promise<Staff> {
  return apiRequest<Staff>(`/staff/${id}`, { method: 'PATCH', body: changes, token: requireToken() })
}

/**
 * PATCH /api/staff/:id/deactivate -- Owner. Gak ada endpoint hapus,
 * cuma nonaktifin. Backend nolak (400) kalau targetnya akun Owner --
 * termasuk nonaktifin diri sendiri, biar toko gak kehilangan
 * satu-satunya akun yang bisa ngurus staf.
 */
export async function deactivateStaff(id: string): Promise<Staff> {
  return apiRequest<Staff>(`/staff/${id}/deactivate`, { method: 'PATCH', token: requireToken() })
}

/** PATCH /api/staff/:id/activate -- Owner. Buat mulihin akun yang sebelumnya dinonaktifkan. */
export async function activateStaff(id: string): Promise<Staff> {
  return apiRequest<Staff>(`/staff/${id}/activate`, { method: 'PATCH', token: requireToken() })
}
