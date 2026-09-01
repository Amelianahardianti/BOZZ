import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getDefaultRouteForRole } from './routes'

/** '/' -> halaman default ROLE-NYA SENDIRI (SRS 2.2), bukan selalu Dashboard. */
export function IndexRedirect() {
  const { session } = useAuth()
  // RequireAuth di parent route sudah mastiin session ada duluan.
  if (!session) return null
  return <Navigate to={getDefaultRouteForRole(session.user.role)} replace />
}
