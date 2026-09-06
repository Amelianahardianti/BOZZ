interface LoadingStateProps {
  label?: string
}

/** Teks loading standar buat semua halaman list -- dipakai pas data lagi di-fetch. */
export function LoadingState({ label = 'Memuat...' }: LoadingStateProps) {
  return <p className="text-sm text-slate-400">{label}</p>
}
