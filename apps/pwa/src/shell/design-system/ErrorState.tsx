interface ErrorStateProps {
  title?: string
  description: string
}

/**
 * Dipakai KHUSUS buat kegagalan load/fetch data -- BUKAN buat "data
 * kosong" (itu tetap `EmptyState`). Sengaja ditandai beda (border solid
 * merah, bukan dashed abu-abu) supaya user bisa bedain "belum ada data"
 * vs "gagal dimuat" sekilas pandang tanpa harus baca teksnya.
 */
export function ErrorState({ title = 'Gagal memuat data', description }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/40 px-6 py-16 text-center">
      <p className="text-sm font-medium text-red-700">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-red-600">{description}</p>
    </div>
  )
}
