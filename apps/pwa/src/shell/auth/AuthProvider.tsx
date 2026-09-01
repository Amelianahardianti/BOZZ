import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, STORAGE_KEY, type AuthContextValue, type AuthSession } from './auth-context'

function readStoredSession(): AuthSession | null {
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

/**
 * Nyimpen sesi login di memori (React state) + localStorage, biar
 * tetap login walau tab di-refresh. Dipakai Login Page buat nyimpen
 * hasil login, dan nanti dipakai RBAC-Aware Route Guards buat cek
 * "sudah login belum" + "rolenya apa".
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession())

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
