import { readStoredSession } from '../shell/auth/auth-context'
import { apiRequest } from './client'

export type NotificationReferenceType = 'external_order' | 'ticket'

/** Cerminan #/components/schemas/Notification di contracts/api.yaml. */
export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string | null
  reference_type: NotificationReferenceType | null
  reference_id: string | null
  is_read: boolean
  created_at: string
}

export interface FetchNotificationsParams {
  is_read?: boolean
  page?: number
  limit?: number
}

function requireToken(): string {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login.')
  }
  return session.token
}

/** GET /api/notifications -- notifikasi milik user yang login, terbaru duluan. Balikin array langsung (bukan wrapper paginated). */
export async function fetchNotifications(params: FetchNotificationsParams = {}): Promise<Notification[]> {
  const query = new URLSearchParams()
  if (params.is_read !== undefined) query.set('is_read', String(params.is_read))
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const qs = query.toString()
  return apiRequest<Notification[]>(`/notifications${qs ? `?${qs}` : ''}`, { token: requireToken() })
}

/** PATCH /api/notifications/:id/read -- tandai satu notifikasi sudah dibaca. */
export async function markNotificationRead(id: string): Promise<Notification> {
  return apiRequest<Notification>(`/notifications/${id}/read`, { method: 'PATCH', token: requireToken() })
}
