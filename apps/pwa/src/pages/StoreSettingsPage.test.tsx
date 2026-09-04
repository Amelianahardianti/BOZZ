import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../api/client'
import * as storeSettingsApi from '../api/storeSettings'
import type { StoreSettings } from '../api/storeSettings'
import * as imageUtils from '../shared/image'
import { StoreSettingsPage } from './StoreSettingsPage'

vi.mock('../api/storeSettings', () => ({
  fetchStoreSettings: vi.fn(),
  updateStoreSettings: vi.fn(),
}))

// validateLogoFile dibiarkan implementasi ASLI (murni, gak nyentuh
// browser API) -- cuma compressImageToDataUrl yang di-mock, karena itu
// butuh Image/canvas beneran yang jsdom gak bisa render.
vi.mock('../shared/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/image')>()
  return { ...actual, compressImageToDataUrl: vi.fn() }
})

const mockedFetch = vi.mocked(storeSettingsApi.fetchStoreSettings)
const mockedUpdate = vi.mocked(storeSettingsApi.updateStoreSettings)
const mockedCompress = vi.mocked(imageUtils.compressImageToDataUrl)

function buildSettings(overrides: Partial<StoreSettings> = {}): StoreSettings {
  return {
    id: 'settings-1',
    business_name: 'Toko Saya',
    address: 'Jl. Mawar No. 1',
    phone: '08123456789',
    receipt_footer_note: null,
    logo_url: null,
    updated_by: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedFetch.mockResolvedValue(buildSettings())
})

describe('StoreSettingsPage', () => {
  it('load data dari fetchStoreSettings(), isi form ke-prefill', async () => {
    render(<StoreSettingsPage />)

    expect(await screen.findByLabelText('Nama Bisnis')).toHaveValue('Toko Saya')
    expect(screen.getByLabelText('Alamat')).toHaveValue('Jl. Mawar No. 1')
    expect(screen.getByLabelText('Telepon')).toHaveValue('08123456789')
  })

  it('field null dari backend jadi input kosong (bukan "null" literal)', async () => {
    render(<StoreSettingsPage />)

    expect(await screen.findByLabelText('Catatan Kaki Struk')).toHaveValue('')
  })

  it('gagal load -- nampilin pesan error', async () => {
    mockedFetch.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'Server lagi down.'))
    render(<StoreSettingsPage />)

    expect(await screen.findByText('Server lagi down.')).toBeInTheDocument()
  })

  it('edit & simpan -- manggil updateStoreSettings dengan isi form, tampilin "Tersimpan."', async () => {
    const user = userEvent.setup()
    mockedUpdate.mockResolvedValue(buildSettings({ business_name: 'Toko Baru' }))
    render(<StoreSettingsPage />)

    await screen.findByLabelText('Nama Bisnis')
    await user.clear(screen.getByLabelText('Nama Bisnis'))
    await user.type(screen.getByLabelText('Nama Bisnis'), 'Toko Baru')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(mockedUpdate).toHaveBeenCalledWith({
      business_name: 'Toko Baru',
      address: 'Jl. Mawar No. 1',
      phone: '08123456789',
      receipt_footer_note: '',
      logo_url: '',
    })
    expect(await screen.findByText('Tersimpan.')).toBeInTheDocument()
  })

  it('gagal simpan -- nampilin pesan error, gak nampilin "Tersimpan."', async () => {
    const user = userEvent.setup()
    mockedUpdate.mockRejectedValue(new ApiRequestError(400, 'VALIDATION_ERROR', 'Nama bisnis wajib diisi.'))
    render(<StoreSettingsPage />)

    await screen.findByLabelText('Nama Bisnis')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByText('Nama bisnis wajib diisi.')).toBeInTheDocument()
    expect(screen.queryByText('Tersimpan.')).not.toBeInTheDocument()
  })

  it('pilih file JPG valid -- preview muncul, disimpan sebagai data URL hasil compress', async () => {
    const user = userEvent.setup()
    mockedCompress.mockResolvedValue('data:image/jpeg;base64,hasilcompress')
    mockedUpdate.mockResolvedValue(buildSettings())
    render(<StoreSettingsPage />)
    await screen.findByLabelText('Nama Bisnis')

    const file = new File(['isi-gambar'], 'logo.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Logo Toko'), file)

    expect(mockedCompress).toHaveBeenCalledWith(file)
    const preview = await screen.findByAltText('Logo toko')
    expect(preview).toHaveAttribute('src', 'data:image/jpeg;base64,hasilcompress')

    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ logo_url: 'data:image/jpeg;base64,hasilcompress' }),
    )
  })

  it('file bukan JPG/PNG -- nampilin error, gak manggil compress', async () => {
    render(<StoreSettingsPage />)
    await screen.findByLabelText('Nama Bisnis')

    // fireEvent.change (bukan userEvent.upload) SENGAJA dipakai -- atribut
    // `accept` cuma hint UI, gak dipaksa browser (drag-drop misalnya bisa
    // lewatin), jadi validasi manual di komponen ini yang beneran diuji.
    const file = new File(['isi-pdf'], 'dokumen.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Logo Toko'), { target: { files: [file] } })

    expect(await screen.findByText('Format logo harus JPG atau PNG.')).toBeInTheDocument()
    expect(mockedCompress).not.toHaveBeenCalled()
  })

  it('file lebih dari 5MB -- ditolak sebelum di-compress', async () => {
    const user = userEvent.setup()
    render(<StoreSettingsPage />)
    await screen.findByLabelText('Nama Bisnis')

    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'besar.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Logo Toko'), bigFile)

    expect(await screen.findByText('Ukuran file maksimal 5MB.')).toBeInTheDocument()
    expect(mockedCompress).not.toHaveBeenCalled()
  })

  it('compress gagal (mis. file korup) -- nampilin pesan errornya', async () => {
    const user = userEvent.setup()
    mockedCompress.mockRejectedValue(new Error('File bukan gambar yang valid.'))
    render(<StoreSettingsPage />)
    await screen.findByLabelText('Nama Bisnis')

    const file = new File(['isi-gambar'], 'logo.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Logo Toko'), file)

    expect(await screen.findByText('File bukan gambar yang valid.')).toBeInTheDocument()
  })

  it('klik "Hapus Logo" -- preview ilang, logo_url dikosongin pas simpan', async () => {
    const user = userEvent.setup()
    mockedFetch.mockResolvedValue(buildSettings({ logo_url: 'data:image/jpeg;base64,logolama' }))
    mockedUpdate.mockResolvedValue(buildSettings())
    render(<StoreSettingsPage />)

    expect(await screen.findByAltText('Logo toko')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hapus Logo' }))
    expect(screen.queryByAltText('Logo toko')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(mockedUpdate).toHaveBeenCalledWith(expect.objectContaining({ logo_url: '' }))
  })
})
