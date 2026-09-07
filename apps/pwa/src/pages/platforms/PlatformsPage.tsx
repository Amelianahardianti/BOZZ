import { useEffect, useState } from 'react'
import { connectPlatform, disconnectPlatform, fetchPlatforms, syncPlatform, type Platform, type PlatformName } from '../../api/platforms'
import { ApiRequestError } from '../../api/client'
import { ConfirmActionModal, EmptyState, ErrorState, LoadingState } from '../../shell/design-system'
import { PlatformCard, type PlatformActionType } from './PlatformCard'

const PLATFORM_LABEL: Record<PlatformName, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok',
  fakestore: 'FakeStore (demo)',
  tokopedia: 'Tokopedia',
}

export function PlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Aksi mana yang lagi jalan buat platform mana -- MURNI presentation/
  // loading state (tombol mana yang nunjukin spinner vs cuma disabled),
  // gak ngubah kapan API beneran dipanggil.
  const [actioning, setActioning] = useState<{ platform: PlatformName; type: PlatformActionType } | null>(null)
  const [pendingDisconnect, setPendingDisconnect] = useState<Platform | null>(null)
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false)

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
    setActioning({ platform: platformName, type: 'connect' })
    try {
      await connectPlatform(platformName)
      load()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal menghubungkan platform.')
    } finally {
      setActioning(null)
    }
  }

  async function handleSync(platform: Platform) {
    setActioning({ platform: platform.platform_name, type: 'sync' })
    try {
      await syncPlatform(platform.platform_name)
      load()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal memulai sinkronisasi.')
    } finally {
      setActioning(null)
    }
  }

  async function handleConfirmDisconnect() {
    if (!pendingDisconnect) return
    setIsConfirmSubmitting(true)
    setActioning({ platform: pendingDisconnect.platform_name, type: 'disconnect' })
    try {
      await disconnectPlatform(pendingDisconnect.platform_name)
      setPendingDisconnect(null)
      load()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal memutuskan koneksi platform.')
    } finally {
      setIsConfirmSubmitting(false)
      setActioning(null)
    }
  }

  return (
    <>
      {isLoading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState description={loadError} />
      ) : platforms.length === 0 ? (
        <EmptyState title="Belum ada platform terdaftar" />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {platforms.map((platform) => (
            <PlatformCard
              key={platform.platform_name}
              platform={platform}
              actioningAction={actioning?.platform === platform.platform_name ? actioning.type : null}
              onConnect={() => handleConnect(platform.platform_name)}
              onSync={() => handleSync(platform)}
              onDisconnect={() => setPendingDisconnect(platform)}
            />
          ))}
        </div>
      )}

      {pendingDisconnect && (
        <ConfirmActionModal
          title="Putuskan Platform?"
          description={`Anda yakin ingin memutuskan koneksi ${PLATFORM_LABEL[pendingDisconnect.platform_name]} dari toko ini? Sinkronisasi order baru bakal berhenti sampai dihubungkan lagi.`}
          confirmWord="putuskan"
          confirmLabel="Putuskan"
          variant="danger"
          isSubmitting={isConfirmSubmitting}
          onConfirm={handleConfirmDisconnect}
          onCancel={() => setPendingDisconnect(null)}
        />
      )}
    </>
  )
}
