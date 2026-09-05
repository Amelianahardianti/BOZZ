import { Button } from './Button'

interface PaginationProps {
  page: number
  /** Sumber kebenaran buat disable tombol "Berikutnya" -- dihitung per halaman dari response API (mis. `list.length === pageSize`), BUKAN dari `totalPages`. */
  hasNextPage: boolean
  onPrevious: () => void
  onNext: () => void
  /** Kalau dikasih, teks jadi "Halaman X dari Y". Kalau tidak, cuma "Halaman X". Murni buat tampilan -- tidak dipakai buat gating tombol. */
  totalPages?: number
}

/** Footer pagination standar -- Sebelumnya/Halaman.../Berikutnya, dipakai di semua halaman list. */
export function Pagination({ page, hasNextPage, onPrevious, onNext, totalPages }: PaginationProps) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <Button variant="secondary" disabled={page <= 1} onClick={onPrevious}>
        Sebelumnya
      </Button>
      <p className="text-sm text-slate-500">
        {totalPages !== undefined ? `Halaman ${page} dari ${totalPages}` : `Halaman ${page}`}
      </p>
      <Button variant="secondary" disabled={!hasNextPage} onClick={onNext}>
        Berikutnya
      </Button>
    </div>
  )
}
