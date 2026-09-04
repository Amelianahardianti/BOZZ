import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as staffApi from '../api/staff'
import type { Staff } from '../api/staff'
import { ApiRequestError } from '../api/client'
import { StaffPage } from './StaffPage'

vi.mock('../api/staff', () => ({
  fetchStaff: vi.fn(),
  createStaff: vi.fn(),
  updateStaff: vi.fn(),
  deactivateStaff: vi.fn(),
  activateStaff: vi.fn(),
}))

const mockedFetchStaff = vi.mocked(staffApi.fetchStaff)
const mockedCreateStaff = vi.mocked(staffApi.createStaff)
const mockedUpdateStaff = vi.mocked(staffApi.updateStaff)
const mockedDeactivateStaff = vi.mocked(staffApi.deactivateStaff)
const mockedActivateStaff = vi.mocked(staffApi.activateStaff)

function buildStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id: 'staff-1',
    name: 'Budi Kasir',
    email_or_username: 'budi',
    role: 'kasir',
    phone: null,
    is_active: true,
    created_by: 'owner-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedFetchStaff.mockResolvedValue([buildStaff()])
})

describe('StaffPage', () => {
  it('nampilin daftar staf dari fetchStaff()', async () => {
    render(<StaffPage />)

    expect(await screen.findByText('Budi Kasir')).toBeInTheDocument()
    expect(screen.getByText('budi')).toBeInTheDocument()
    expect(screen.getByText('Aktif', { selector: 'span' })).toBeInTheDocument()
  })

  it('daftar kosong -- nampilin empty state, bukan tabel kosong', async () => {
    mockedFetchStaff.mockResolvedValue([])
    render(<StaffPage />)

    expect(await screen.findByText('Belum ada staf')).toBeInTheDocument()
  })

  it('gagal fetch -- nampilin pesan error dari backend', async () => {
    mockedFetchStaff.mockRejectedValue(new Error('Server lagi down'))
    render(<StaffPage />)

    expect(await screen.findByText('Gagal memuat data')).toBeInTheDocument()
  })

  it('tambah staf baru -- form terkirim, list ke-refresh', async () => {
    const user = userEvent.setup()
    mockedCreateStaff.mockResolvedValue(buildStaff({ id: 'staff-2', name: 'Sari Pengepak', role: 'pengepak' }))
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.click(screen.getByRole('button', { name: 'Tambah Staf' }))
    await user.type(screen.getByLabelText('Nama'), 'Sari Pengepak')
    await user.type(screen.getByLabelText('Username'), 'sari')
    await user.type(screen.getByLabelText('Password'), 'sari123456')
    await user.selectOptions(screen.getByLabelText('Role'), 'pengepak')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(mockedCreateStaff).toHaveBeenCalledWith({
        name: 'Sari Pengepak',
        email_or_username: 'sari',
        password: 'sari123456',
        role: 'pengepak',
        phone: undefined,
      }),
    )
    // Balik ke list view lagi abis submit sukses.
    expect(await screen.findByRole('button', { name: 'Tambah Staf' })).toBeInTheDocument()
    expect(mockedFetchStaff).toHaveBeenCalledTimes(2) // initial load + refresh abis create
  })

  it('form create gagal -- pesan error ditampilin, TETAP di form (gak balik ke list)', async () => {
    const user = userEvent.setup()
    mockedCreateStaff.mockRejectedValue(new ApiRequestError(400, 'VALIDATION_ERROR', 'Username sudah dipakai.'))
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.click(screen.getByRole('button', { name: 'Tambah Staf' }))
    await user.type(screen.getByLabelText('Nama'), 'Duplikat')
    await user.type(screen.getByLabelText('Username'), 'budi')
    await user.type(screen.getByLabelText('Password'), 'apapun123')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByText('Username sudah dipakai.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nama')).toBeInTheDocument() // form masih kebuka
  })

  it('edit staf -- form ke-prefill data yang ada, PATCH manggil updateStaff', async () => {
    const user = userEvent.setup()
    mockedUpdateStaff.mockResolvedValue(buildStaff({ name: 'Budi Kasir Senior' }))
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Nama')).toHaveValue('Budi Kasir')
    // Password gak ditampilin pas edit -- gak ada cara ganti password lewat form ini.
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('Nama'))
    await user.type(screen.getByLabelText('Nama'), 'Budi Kasir Senior')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(mockedUpdateStaff).toHaveBeenCalledWith('staff-1', {
        name: 'Budi Kasir Senior',
        email_or_username: 'budi',
        role: 'kasir',
        phone: undefined,
      }),
    )
  })

  it('nonaktifkan staf -- minta ketik ulang "nonaktifkan" dulu, baru manggil deactivateStaff', async () => {
    const user = userEvent.setup()
    mockedDeactivateStaff.mockResolvedValue(buildStaff({ is_active: false }))
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.click(screen.getByRole('button', { name: 'Nonaktifkan' }))
    const dialog = screen.getByRole('dialog')
    // Tombol konfirmasi harusnya kedisable sampe kata yang bener diketik.
    expect(within(dialog).getByRole('button', { name: 'Nonaktifkan' })).toBeDisabled()
    expect(mockedDeactivateStaff).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText(/Ketik "nonaktifkan"/i), 'nonaktifkan')
    await user.click(within(dialog).getByRole('button', { name: 'Nonaktifkan' }))

    await waitFor(() => expect(mockedDeactivateStaff).toHaveBeenCalledWith('staff-1'))
  })

  it('salah ketik kata konfirmasi -- deactivateStaff GAK dipanggil', async () => {
    const user = userEvent.setup()
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.click(screen.getByRole('button', { name: 'Nonaktifkan' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Ketik "nonaktifkan"/i), 'nonaktif')

    expect(within(dialog).getByRole('button', { name: 'Nonaktifkan' })).toBeDisabled()
    expect(mockedDeactivateStaff).not.toHaveBeenCalled()
  })

  it('batal konfirmasi nonaktifkan -- deactivateStaff GAK dipanggil, modal ketutup', async () => {
    const user = userEvent.setup()
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.click(screen.getByRole('button', { name: 'Nonaktifkan' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Batal' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockedDeactivateStaff).not.toHaveBeenCalled()
  })

  it('tombol Batal di form balik ke list tanpa nyimpen apa-apa', async () => {
    const user = userEvent.setup()
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.click(screen.getByRole('button', { name: 'Tambah Staf' }))
    await user.click(screen.getByRole('button', { name: 'Batal' }))

    expect(await screen.findByText('Budi Kasir')).toBeInTheDocument()
    expect(mockedCreateStaff).not.toHaveBeenCalled()
  })

  it('akun Owner gak ada tombol Nonaktifkan sama sekali -- ada label "Akun Owner" sebagai gantinya', async () => {
    mockedFetchStaff.mockResolvedValue([buildStaff({ id: 'owner-1', name: 'Owner Toko', role: 'owner' })])
    render(<StaffPage />)

    await screen.findByText('Owner Toko')

    expect(screen.getByText('Akun Owner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nonaktifkan' })).not.toBeInTheDocument()
    // Edit tetap ada -- cuma nonaktifin yang diblok.
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('staf yang nonaktif nampilin tombol Aktifkan (bukan Nonaktifkan), ketik ulang lalu konfirmasi manggil activateStaff', async () => {
    const user = userEvent.setup()
    mockedFetchStaff.mockResolvedValue([buildStaff({ is_active: false })])
    mockedActivateStaff.mockResolvedValue(buildStaff({ is_active: true }))
    render(<StaffPage />)

    await screen.findByText('Budi Kasir')
    expect(screen.queryByRole('button', { name: 'Nonaktifkan' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Aktifkan' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Ketik "aktifkan"/i), 'aktifkan')
    await user.click(within(dialog).getByRole('button', { name: 'Aktifkan' }))

    await waitFor(() => expect(mockedActivateStaff).toHaveBeenCalledWith('staff-1'))
    expect(mockedFetchStaff).toHaveBeenCalledTimes(2) // initial load + refresh abis aktifin
  })

  it('gagal aktifkan -- nampilin alert dari backend', async () => {
    const user = userEvent.setup()
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    mockedFetchStaff.mockResolvedValue([buildStaff({ is_active: false })])
    mockedActivateStaff.mockRejectedValue(new ApiRequestError(404, 'NOT_FOUND', 'Staf tidak ditemukan.'))
    render(<StaffPage />)

    await screen.findByText('Budi Kasir')
    await user.click(screen.getByRole('button', { name: 'Aktifkan' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Ketik "aktifkan"/i), 'aktifkan')
    await user.click(within(dialog).getByRole('button', { name: 'Aktifkan' }))

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Staf tidak ditemukan.'))
  })

  it('search bar -- filter berdasarkan nama atau username', async () => {
    const user = userEvent.setup()
    mockedFetchStaff.mockResolvedValue([
      buildStaff({ id: 'staff-1', name: 'Budi Kasir', email_or_username: 'budi' }),
      buildStaff({ id: 'staff-2', name: 'Sari Pengepak', email_or_username: 'sari', role: 'pengepak' }),
    ])
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')
    expect(screen.getByText('Sari Pengepak')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Cari'), 'sari')

    expect(screen.queryByText('Budi Kasir')).not.toBeInTheDocument()
    expect(screen.getByText('Sari Pengepak')).toBeInTheDocument()
  })

  it('search bar -- juga cocok lewat username, bukan cuma nama', async () => {
    const user = userEvent.setup()
    mockedFetchStaff.mockResolvedValue([
      buildStaff({ id: 'staff-1', name: 'Budi Kasir', email_or_username: 'budi' }),
      buildStaff({ id: 'staff-2', name: 'Sari Pengepak', email_or_username: 'sari', role: 'pengepak' }),
    ])
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.type(screen.getByLabelText('Cari'), 'budi')

    expect(screen.getByText('Budi Kasir')).toBeInTheDocument()
    expect(screen.queryByText('Sari Pengepak')).not.toBeInTheDocument()
  })

  it('filter role -- cuma nampilin staf sesuai role yang dipilih', async () => {
    const user = userEvent.setup()
    mockedFetchStaff.mockResolvedValue([
      buildStaff({ id: 'staff-1', name: 'Budi Kasir', role: 'kasir' }),
      buildStaff({ id: 'staff-2', name: 'Sari Pengepak', role: 'pengepak' }),
    ])
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.selectOptions(screen.getByLabelText('Role'), 'pengepak')

    expect(screen.queryByText('Budi Kasir')).not.toBeInTheDocument()
    expect(screen.getByText('Sari Pengepak')).toBeInTheDocument()
  })

  it('filter status -- cuma nampilin staf yang nonaktif', async () => {
    const user = userEvent.setup()
    mockedFetchStaff.mockResolvedValue([
      buildStaff({ id: 'staff-1', name: 'Budi Kasir', is_active: true }),
      buildStaff({ id: 'staff-2', name: 'Sari Nonaktif', is_active: false }),
    ])
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.selectOptions(screen.getByLabelText('Status'), 'inactive')

    expect(screen.queryByText('Budi Kasir')).not.toBeInTheDocument()
    expect(screen.getByText('Sari Nonaktif')).toBeInTheDocument()
  })

  it('search/filter gak nemu hasil -- nampilin empty state, bukan tabel kosong', async () => {
    const user = userEvent.setup()
    render(<StaffPage />)
    await screen.findByText('Budi Kasir')

    await user.type(screen.getByLabelText('Cari'), 'gak-ada-yang-cocok')

    expect(await screen.findByText('Gak ada staf yang cocok')).toBeInTheDocument()
  })
})
