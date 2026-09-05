import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as platformsApi from '../../../api/platforms'
import type { Platform } from '../../../api/platforms'
import { ApiRequestError } from '../../../api/client'
import { PlatformsPage } from '../PlatformsPage'

vi.mock('../../../api/platforms', () => ({
  fetchPlatforms: vi.fn(),
  connectPlatform: vi.fn(),
  disconnectPlatform: vi.fn(),
  syncPlatform: vi.fn(),
}))

const mockedFetch = vi.mocked(platformsApi.fetchPlatforms)
const mockedConnect = vi.mocked(platformsApi.connectPlatform)
const mockedDisconnect = vi.mocked(platformsApi.disconnectPlatform)
const mockedSync = vi.mocked(platformsApi.syncPlatform)

function buildPlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    id: 'platform-1',
    platform_name: 'shopee',
    shop_id_external: 'MOCK-SHOP-SHOPEE',
    token_expires_at: new Date().toISOString(),
    is_connected: true,
    last_synced_at: new Date().toISOString(),
    last_sync_status: 'success',
    configured: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PlatformsPage', () => {
  it('platform terhubung -- nampilin badge Terhubung, tombol Sinkronkan & Putuskan', async () => {
    mockedFetch.mockResolvedValue([buildPlatform()])
    render(<PlatformsPage />)

    expect(await screen.findByText('Shopee')).toBeInTheDocument()
    expect(screen.getByText('Terhubung')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sinkronkan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Putuskan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hubungkan' })).not.toBeInTheDocument()
  })

  it('platform belum terhubung -- badge Belum Terhubung, cuma tombol Hubungkan', async () => {
    mockedFetch.mockResolvedValue([buildPlatform({ is_connected: false, shop_id_external: null, last_synced_at: null, last_sync_status: null })])
    render(<PlatformsPage />)

    expect(await screen.findByText('Belum Terhubung')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hubungkan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sinkronkan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Putuskan' })).not.toBeInTheDocument()
  })

  it('klik Hubungkan -- manggil connectPlatform, list ke-refresh', async () => {
    const user = userEvent.setup()
    mockedFetch.mockResolvedValueOnce([buildPlatform({ is_connected: false })])
    mockedConnect.mockResolvedValue(buildPlatform({ is_connected: true }))
    mockedFetch.mockResolvedValueOnce([buildPlatform({ is_connected: true })])
    render(<PlatformsPage />)

    await user.click(await screen.findByRole('button', { name: 'Hubungkan' }))

    await waitFor(() => expect(mockedConnect).toHaveBeenCalledWith('shopee'))
    expect(await screen.findByRole('button', { name: 'Sinkronkan' })).toBeInTheDocument()
  })

  it('klik Putuskan -- minta konfirmasi dulu, baru manggil disconnectPlatform', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockedFetch.mockResolvedValue([buildPlatform()])
    mockedDisconnect.mockResolvedValue(buildPlatform({ is_connected: false }))
    render(<PlatformsPage />)

    await user.click(await screen.findByRole('button', { name: 'Putuskan' }))

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(mockedDisconnect).toHaveBeenCalledWith('shopee'))
  })

  it('batal konfirmasi Putuskan -- disconnectPlatform GAK dipanggil', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockedFetch.mockResolvedValue([buildPlatform()])
    render(<PlatformsPage />)

    await user.click(await screen.findByRole('button', { name: 'Putuskan' }))

    expect(mockedDisconnect).not.toHaveBeenCalled()
  })

  it('klik Sinkronkan -- manggil syncPlatform', async () => {
    const user = userEvent.setup()
    mockedFetch.mockResolvedValue([buildPlatform()])
    mockedSync.mockResolvedValue(buildPlatform())
    render(<PlatformsPage />)

    await user.click(await screen.findByRole('button', { name: 'Sinkronkan' }))

    await waitFor(() => expect(mockedSync).toHaveBeenCalledWith('shopee'))
  })

  it('gagal load -- pesan error dari backend', async () => {
    mockedFetch.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'Server lagi down.'))
    render(<PlatformsPage />)

    expect(await screen.findByText('Server lagi down.')).toBeInTheDocument()
  })
})
