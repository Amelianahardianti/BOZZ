import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, Card, EmptyState, PageHeader } from './index'

describe('Button', () => {
  it('merender children dan manggil onClick pas diklik', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Simpan</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('gak manggil onClick kalau disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} disabled>
        Simpan
      </Button>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Card', () => {
  it('merender children di dalamnya', () => {
    render(<Card>Isi kartu</Card>)

    expect(screen.getByText('Isi kartu')).toBeInTheDocument()
  })
})

describe('PageHeader', () => {
  it('merender title, description, dan actions', () => {
    render(<PageHeader title="Judul" description="Deskripsi" actions={<button>Aksi</button>} />)

    expect(screen.getByRole('heading', { name: 'Judul' })).toBeInTheDocument()
    expect(screen.getByText('Deskripsi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aksi' })).toBeInTheDocument()
  })

  it('gak nge-render description/actions kalau gak dikasih', () => {
    render(<PageHeader title="Judul" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('merender title dan description', () => {
    render(<EmptyState title="Kosong" description="Belum ada data" />)

    expect(screen.getByText('Kosong')).toBeInTheDocument()
    expect(screen.getByText('Belum ada data')).toBeInTheDocument()
  })
})
