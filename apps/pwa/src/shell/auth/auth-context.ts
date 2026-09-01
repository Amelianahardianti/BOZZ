import { createContext } from 'react'
import type { AppRole } from '../routing/routes'

/** Cerminan #/components/schemas/User (minus password_hash) di contracts/api.yaml. */
export interface AuthUser {
  id: string
  name: string
  email_or_username: string
  role: AppRole
  phone: string | null
  is_active: boolean
}

export interface AuthSession {
  token: string
  user: AuthUser
}

export interface AuthContextValue {
  /** null kalau belum login. */
  session: AuthSession | null
  login: (session: AuthSession) => void
  logout: () => void
}

export const STORAGE_KEY = 'pos-pwa:auth-session'

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
