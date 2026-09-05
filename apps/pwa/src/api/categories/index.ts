import { readStoredSession } from '../../shell/auth/auth-context'
import { apiRequest } from '../client'

/** Cerminan #/components/schemas/Category di contracts/api.yaml. */
export interface Category {
  id: string
  name: string
  created_by: string | null
  created_at: string
}

/** GET /api/categories -- array polos (bukan dibungkus {data, page, ...} kayak /products). */
export async function fetchCategories(): Promise<Category[]> {
  const session = readStoredSession()
  if (!session) return []
  return apiRequest<Category[]>('/categories', { token: session.token })
}
