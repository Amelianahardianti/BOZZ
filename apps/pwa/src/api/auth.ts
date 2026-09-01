import type { AuthSession } from '../shell/auth/auth-context'
import { apiRequest } from './client'

/** POST /api/auth/login (contracts/api.yaml). */
export function login(emailOrUsername: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email_or_username: emailOrUsername, password },
  })
}
