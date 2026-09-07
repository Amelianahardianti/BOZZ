import { EmptyState } from '../shell/design-system'

interface StubPageProps {
  description: string
}

/** Placeholder generik buat rute yang sudah ada tapi halamannya belum dibangun. Judul halaman TIDAK diulang di sini -- sudah tampil di top header AppShell (nama menu aktif). */
export function StubPage({ description }: StubPageProps) {
  return <EmptyState title="Halaman belum dibangun" description={description} />
}
