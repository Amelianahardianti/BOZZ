import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-2xl font-semibold text-slate-900">404</p>
      <p className="text-sm text-slate-500">Halaman tidak ditemukan.</p>
      <Link to="/" className="text-sm font-medium text-brand-600 hover:underline">
        Kembali ke beranda
      </Link>
    </div>
  )
}
