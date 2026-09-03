import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, Card, ConfirmActionModal, EmptyState, PageHeader } from './index'

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

describe('ConfirmActionModal', () => {
  function setup(onConfirm = vi.fn(), onCancel = vi.fn()) {
    render(
      <ConfirmActionModal
        title="Hapus Data"
        description="Yakin mau hapus?"
        confirmWord="hapus"
        confirmLabel="Hapus"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    return { onConfirm, onCancel }
  }

  it('tombol konfirmasi kedisable sampe kata yang bener diketik (case-insensitive)', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()

    expect(screen.getByRole('button', { name: 'Hapus' })).toBeDisabled()

    await user.type(screen.getByLabelText(/Ketik "hapus"/i), 'HAPUS')
    expect(screen.getByRole('button', { name: 'Hapus' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Hapus' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('kata salah -- tombol tetap disable, onConfirm gak kepanggil', async () => {
    const user = userEvent.setup()
    const { onConfirm } = setup()

    await user.type(screen.getByLabelText(/Ketik "hapus"/i), 'hapuss')
    expect(screen.getByRole('button', { name: 'Hapus' })).toBeDisabled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('klik Batal manggil onCancel', async () => {
    const user = userEvent.setup()
    const { onCancel } = setup()

    await user.click(screen.getByRole('button', { name: 'Batal' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
