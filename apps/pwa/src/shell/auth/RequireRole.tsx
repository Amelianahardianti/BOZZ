import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { getDefaultRouteForRole, type AppRole } from '../routing/routes'
import { useAuth } from './useAuth'

interface RequireRoleProps {
  roles: AppRole[]
  children: ReactNode
}

/**
 * Lapis kedua RBAC: sudah login, tapi rolenya emang boleh buka
 * halaman ini apa nggak (SRS 2.2 -- Kasir cuma Kasir/POS, Pengepak
 * cuma Ticket Saya, Owner seluruh halaman).
 *
 * Kalau nggak boleh, dialihkan ke halaman DEFAULT ROLENYA SENDIRI --
 * bukan halaman error generik -- karena itu tempat yang emang haknya
 * dia, bukan "nyasar".
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { session } = useAuth()

  // RequireAuth di parent route sudah mastiin session ada duluan --
  // null di sini cuma bisa kejadian sesaat pas logout, biarin
  // RequireAuth yang nangani redirect ke login di render berikutnya.
  if (!session) return null

  if (!roles.includes(session.user.role)) {
    return <Navigate to={getDefaultRouteForRole(session.user.role)} replace />
  }

  return <>{children}</>
}
