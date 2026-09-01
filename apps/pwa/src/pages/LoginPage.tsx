import { Card } from '../shell/design-system'

/**
 * Placeholder rute -- form login beneran (FR-FI-01) dibangun di
 * checklist "Login Page", tugas berikutnya setelah shell/routing ini.
 * Sengaja di luar AppShell (halaman login tidak punya nav).
 */
export function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-slate-900">Masuk</h1>
        <p className="mt-1 text-sm text-slate-500">
          Form login menyusul di fase berikutnya (FR-FI-01) -- ini baru placeholder rute.
        </p>
      </Card>
    </div>
  )
}
