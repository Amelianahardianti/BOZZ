import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ROUTES } from '../routing/routes'
import { useAuth } from './useAuth'

/**
 * Lapis pertama RBAC: belum login sama sekali -> lempar ke /login.
 * Path yang lagi dicoba diakses disimpan di location state (`from`)
 * biar abis login sukses, LoginPage bisa balikin user ke situ lagi
 * (bukan selalu ke halaman default rolenya).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()

  if (!session) {
    return <Navigate to={ROUTES.login} state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
