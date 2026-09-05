import { useEffect, useState } from 'react'
import { connectPlatform, disconnectPlatform, fetchPlatforms, syncPlatform, type Platform, type PlatformName } from '../api/platforms'
import { ApiRequestError } from '../api/client'
import { Button, Card, EmptyState, PageHeader } from '../shell/design-system'

const PLATFORM_LABEL: Record<PlatformName, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok',
  fakestore: 'FakeStore (demo)',
}

export function PlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actioningPlatform, setActioningPlatform] = useState<PlatformName | null>(null)

  function load() {
    setIsLoading(true)
    setLoadError(null)
    fetchPlatforms()
      .then(setPlatforms)
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat daftar platform.')
      })
      .finally(() => setIsLoading(false))
  }

  // .then/.catch/.finally (bukan async/await langsung) SENGAJA dipakai
  // di sini -- biar gak ada setState yang kepanggil SINKRON di badan
  // efek (react-hooks/set-state-in-effect), sama pola-nya kayak
  // StaffPage.tsx.
  useEffect(() => {
    fetchPlatforms()
      .then(setPlatforms)
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat daftar platform.')
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function handleConnect(platformName: PlatformName) {
    setActioningPlatform(platformName)
    try {
      await connectPlatform(platformName)
      load()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal menghubungkan platform.')
    } finally {
      setActioningPlatform(null)
    }
  }

  async function handleDisconnect(platform: Platform) {
    if (
      !window.confirm(
        `Putuskan koneksi ${PLATFORM_LABEL[platform.platform_name]}? Sinkronisasi order baru bakal berhenti sampai dihubungkan lagi.`,
      )
    )
      return
    setActioningPlatform(platform.platform_name)
    try {
      await disconnectPlatform(platform.platform_name)
      load()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal memutuskan koneksi platform.')
    } finally {
      setActioningPlatform(null)
    }
  }

  async function handleSync(platform: Platform) {
    setActioningPlatform(platform.platform_name)
    try {
      await syncPlatform(platform.platform_name)
      load()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal memulai sinkronisasi.')
    } finally {
      setActioningPlatform(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Platform"
        description="Hubungkan/putuskan toko ke Shopee, TikTok, FakeStore (FR-OC-01) -- mode mock, belum pakai e-commerce asli."
      />

      {isLoading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : loadError ? (
        <EmptyState title="Gagal memuat data" description={loadError} />
      ) : platforms.length === 0 ? (
        <EmptyState title="Belum ada platform terdaftar" />
      ) : (
        <div className="flex flex-col gap-3">
          {platforms.map((platform) => (
            <Card key={platform.platform_name}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{PLATFORM_LABEL[platform.platform_name]}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        platform.is_connected ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {platform.is_connected ? 'Terhubung' : 'Belum Terhubung'}
                    </span>
                  </div>
                  {platform.is_connected && platform.shop_id_external && (
                    <p className="mt-1 text-xs text-slate-500">Toko: {platform.shop_id_external}</p>
                  )}
                  {platform.last_synced_at && (
                    <p className="mt-1 text-xs text-slate-400">
                      Sync terakhir: {new Date(platform.last_synced_at).toLocaleString('id-ID')}
                      {' -- '}
                      <span className={platform.last_sync_status === 'success' ? 'text-green-600' : 'text-red-600'}>
                        {platform.last_sync_status === 'success' ? 'berhasil' : 'gagal'}
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {platform.is_connected ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={actioningPlatform === platform.platform_name}
                        onClick={() => handleSync(platform)}
                      >
                        {actioningPlatform === platform.platform_name ? 'Memproses...' : 'Sinkronkan'}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={actioningPlatform === platform.platform_name}
                        onClick={() => handleDisconnect(platform)}
                      >
                        Putuskan
                      </Button>
                    </>
                  ) : (
                    <Button
                      disabled={actioningPlatform === platform.platform_name}
                      onClick={() => handleConnect(platform.platform_name)}
                    >
                      {actioningPlatform === platform.platform_name ? 'Menghubungkan...' : 'Hubungkan'}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
