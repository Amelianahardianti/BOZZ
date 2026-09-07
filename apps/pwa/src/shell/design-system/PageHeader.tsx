import type { ReactNode } from 'react'

interface PageHeaderProps {
  /** Opsional -- judul halaman biasanya sudah tampil di top header AppShell (nama menu aktif), jadi kebanyakan halaman TIDAK perlu ngirim ini lagi. Isi cuma kalau butuh judul yang beda dari label menu (mis. "Edit Staf" vs "Tambah Staf"). */
  title?: string
  description?: string
  actions?: ReactNode
}

/** Slot aksi (tombol, dll) di baris atas konten, plus judul/deskripsi OPSIONAL buat kasus yang beneran butuh (lihat catatan title di atas). Kalau title/description/actions kosong semua, gak render apa-apa. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  if (!title && !description && !actions) return null

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        {title && <h1 className="text-xl font-bold text-slate-900 md:text-2xl">{title}</h1>}
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
