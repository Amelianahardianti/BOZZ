import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../api/client'
import * as storeSettingsApi from '../api/storeSettings'
import type { StoreSettings } from '../api/storeSettings'
import { StoreSettingsPage } from './StoreSettingsPage'

vi.mock('../api/storeSettings', () => ({
  fetchStoreSettings: vi.fn(),
  updateStoreSettings: vi.fn(),
}))

const mockedFetch = vi.mocked(storeSettingsApi.fetchStoreSettings)
const mockedUpdate = vi.mocked(storeSettingsApi.updateStoreSettings)

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
})
