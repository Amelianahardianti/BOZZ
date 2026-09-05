import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { login } from '../api/auth'
import { ApiRequestError } from '../api/client'
import { Button, Card } from '../shell/design-system'
import { useAuth } from '../shell/auth/useAuth'
import { getDefaultRouteForRole } from '../shell/routing/routes'

/**
 * FR-FI-01. RequireAuth (router.tsx) ngelempar user belum-login ke
 * sini lewat state.from -- kalau ada, balik ke situ abis berhasil
 * login; kalau nggak, ke halaman default rolenya.
 */
export function LoginPage() {
  const { session, login: setSession } = useAuth()
  const location = useLocation()

  const [emailOrUsername, setEmailOrUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Satu-satunya jalur redirect abis login -- dipicu otomatis begitu
  // `session` keisi (baik abis submit form sukses, maupun kalau
  // ternyata udah login duluan pas buka /login). SENGAJA gak ada
  // navigate() manual di handleSubmit: dulu ada, dan balapan sama
  // guard ini -- setSession() bikin komponen ini re-render duluan
  // sebelum navigate() manual sempat kepakai, guard ini menang tapi
  // gak bawa state.from, jadi user ke-lempar ke halaman default
  // rolenya padahal harusnya balik ke halaman yang tadinya diakses.
  if (session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? getDefaultRouteForRole(session.user.role)} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const newSession = await login(emailOrUsername, password)
      setSession(newSession)
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Terjadi kesalahan, coba lagi.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-slate-900">Masuk</h1>
        <p className="mt-1 text-sm text-slate-500">Masuk pakai akun staf toko kamu.</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4" autoComplete="off" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="email_or_username" className="text-sm font-medium text-slate-700">
              Username / Email
            </label>
            <input
              id="email_or_username"
              name="email_or_username"
              type="text"
              // "off" sengaja, BUKAN "username" -- Kasir/POS (SRS 2.2)
              // itu perangkat bersama di toko, ganti-gantian staf per
              // shift. Kalau browser nawarin "recent input", staf yang
              // login bisa ketiban username staf sebelumnya.
              autoComplete="off"
              required
              value={emailOrUsername}
              onChange={(event) => setEmailOrUsername(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              // "new-password" (bukan "current-password"/"off") adalah
              // trik yang beneran dianggap Chrome buat MATIIN dropdown
              // "gunakan password tersimpan" -- alasan sama kayak
              // username di atas: device bersama, jangan nawarin
              // password staf lain.
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Memproses...' : 'Masuk'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
