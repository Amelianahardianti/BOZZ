import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AuthContext,
  onUnauthorized,
  readStoredSession,
  STORAGE_KEY,
  type AuthContextValue,
  type AuthSession,
} from './auth-context'
import { decodeJwtExpiryMs } from './jwt'

function isExpired(session: AuthSession): boolean {
  const expiryMs = decodeJwtExpiryMs(session.token)
  // Token yang gak kebaca exp-nya dianggap TIDAK expired di sini --
  // biar gagal-aman ke arah "tetap login", bukan tiba-tiba nge-logout
  // orang gara-gara gagal decode. Backend tetap jadi penjaga terakhir
  // (401 -> notifyUnauthorized(), lihat efek di bawah).
  return expiryMs !== null && expiryMs <= Date.now()
}

function readValidStoredSession(): AuthSession | null {
  const session = readStoredSession()
  if (session && isExpired(session)) return null
  return session
}

/**
 * Nyimpen sesi login di memori (React state) + localStorage, biar
 * tetap login walau tab di-refresh. Dipakai Login Page buat nyimpen
 * hasil login, dipakai RBAC-Aware Route Guards buat cek "sudah login
 * belum" + "rolenya apa", dan auto-logout begitu sesinya kedaluwarsa
 * (default backend 8 jam -- JWT_EXPIRES_IN di
 * backend/src/modules/auth-product/service.ts).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readValidStoredSession())

  useEffect(() => {
    try {
      if (session) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // localStorage penuh/gak bisa diakses -- sesi tetap jalan di
      // memori untuk tab ini, cuma gak tersimpan lintas refresh.
    }
  }, [session])

  // Auto-logout PAS token kedaluwarsa. Timer presisi buat kasus normal
  // (tab tetap kebuka), PLUS cek ulang tiap tab balik fokus -- laptop
  // yang di-sleep semalaman gak bikin setTimeout kepicu tepat waktu
  // (timer browser ikut "tidur"), jadi dicek ulang begitu user balik.
  useEffect(() => {
    if (!session) return

    const expiryMs = decodeJwtExpiryMs(session.token)
    if (expiryMs === null) return

    const checkExpiry = () => {
      if (Date.now() >= expiryMs) {
        setSession(null)
      }
    }

    const timeoutId = window.setTimeout(checkExpiry, Math.max(0, expiryMs - Date.now()))
    document.addEventListener('visibilitychange', checkExpiry)

    return () => {
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', checkExpiry)
    }
  }, [session])

  // 401 asli dari backend (token BENERAN ditolak, bukan cuma
  // perkiraan client) juga langsung logout -- lebih otoritatif
  // daripada cek exp doang, nutupin kasus jam device meleset atau
  // token dicabut manual dari sisi server.
  useEffect(() => onUnauthorized(() => setSession(null)), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      login: setSession,
      logout: () => setSession(null),
    }),
    [session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
