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

/**
 * Baca sesi login langsung dari localStorage, TANPA lewat React
 * context. Dipakai AuthProvider (buat state awal), dan dipakai modul
 * offline-sync (shell/offline) buat tau token pas mau sync di
 * background -- itu jalan di luar pohon komponen React, jadi gak bisa
 * pakai useAuth().
 */
export function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthSession
  } catch {
    // localStorage gak bisa diakses (mis. private mode) atau isinya
    // rusak -- anggap aja belum login, bukan bikin app crash.
    return null
  }
}
