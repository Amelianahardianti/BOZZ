import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useLocation } from 'react-router-dom'
import { FiEye, FiEyeOff } from 'react-icons/fi'
import { login } from '../../api/auth'
import { ApiRequestError } from '../../api/client'
import { Button, Card, TextInput } from '../../shell/design-system'
import { useAuth } from '../../shell/auth/useAuth'
import { getCachedStoreSettings } from '../../shell/offline/storeSettingsCache'
import { getDefaultRouteForRole } from '../../shell/routing/routes'

/**
 * FR-FI-01. RequireAuth (router.tsx) ngelempar user belum-login ke
 * sini lewat state.from -- kalau ada, balik ke situ abis berhasil
 * login; kalau nggak, ke halaman default rolenya.
 */
export function LoginPage() {
  const { session, login: setSession } = useAuth()
  const location = useLocation()
  // Baca dari cache offline (Dexie) langsung -- BUKAN fetchStoreSettings(),
  // itu butuh token dan di sini user belum login. Kalau device ini
  // pernah dipakai login sebelumnya, cache-nya masih ada duluan; kalau
  // belum pernah sama sekali (device baru), null -- fallback ke "BOZZ".
  const storeSettings = useLiveQuery(() => getCachedStoreSettings(), []) ?? null

  const [emailOrUsername, setEmailOrUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
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
    <div
      // Gradient hangat brand-ke-secondary (merah muda -> putih -> krem
      // oranye), SANGAT lembut (lewat via white) supaya kontras teks
      // tetap tinggi -- bukan warna solid, cuma nuansa, sesuai brief.
      className="flex min-h-svh flex-col items-center justify-center bg-linear-to-br from-brand-100 via-white to-secondary-100 px-4 py-10"
    >
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        {/* Placeholder logo BOZZ -- sama kayak AppShell, ganti <img src="/logo-bozz.svg" /> pas aset final tersedia. */}
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-brand-300 bg-brand-50 text-xl font-bold text-brand-700">
          B
        </div>
        <div>
          <p className="text-xl font-bold text-slate-900">{storeSettings?.business_name || 'BOZZ'}</p>
          <p className="text-sm text-slate-500">Sistem POS Multi-Platform</p>
        </div>
      </div>

      {/* max-w-md (naik dari max-w-sm) + padding lebih lega (!p-* override
          padding bawaan Card yang p-4, cuma buat instance ini) -- Card
          sendiri (dipakai banyak halaman lain) TIDAK diubah. */}
      <Card className="w-full max-w-md p-6! sm:p-8!">
        <h1 className="text-lg font-semibold text-slate-900">Masuk ke akun Anda</h1>
        <p className="mt-1 text-sm text-slate-500">Gunakan akun yang diberikan Owner toko</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4" autoComplete="off" noValidate>
          <TextInput
            id="email_or_username"
            name="email_or_username"
            label="Username"
            type="text"
            // "off" sengaja, BUKAN "username" -- Kasir/POS (SRS 2.2)
            // itu perangkat bersama di toko, ganti-gantian staf per
            // shift. Kalau browser nawarin "recent input", staf yang
            // login bisa ketiban username staf sebelumnya.
            autoComplete="off"
            required
            value={emailOrUsername}
            onChange={(event) => setEmailOrUsername(event.target.value)}
          />

          <TextInput
            id="password"
            name="password"
            label="Password"
            type={isPasswordVisible ? 'text' : 'password'}
            // "new-password" (bukan "current-password"/"off") adalah
            // trik yang beneran dianggap Chrome buat MATIIN dropdown
            // "gunakan password tersimpan" -- alasan sama kayak
            // username di atas: device bersama, jangan nawarin
            // password staf lain.
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            endAdornment={
              <button
                type="button"
                onClick={() => setIsPasswordVisible((prev) => !prev)}
                aria-label={isPasswordVisible ? 'Sembunyikan password' : 'Tampilkan password'}
                className="text-slate-400 hover:text-slate-600"
              >
                {isPasswordVisible ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
              </button>
            }
          />

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Masuk
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-xs text-slate-400">POS PWA • dapat dipakai offline setelah login pertama</p>
    </div>
  )
}
