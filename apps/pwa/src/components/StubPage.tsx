import { EmptyState, PageHeader } from '../shell/design-system'

interface StubPageProps {
  title: string
  description: string
}

/** Placeholder generik buat rute yang sudah ada tapi halamannya belum dibangun. */
export function StubPage({ title, description }: StubPageProps) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title="Halaman belum dibangun" description={description} />
    </>
  )
}
