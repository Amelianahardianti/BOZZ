import {
  FiBox,
  FiCheckCircle,
  FiClock,
  FiLink,
  FiMapPin,
  FiMusic,
  FiPower,
  FiRefreshCw,
  FiShoppingBag,
  FiShoppingCart,
  FiXCircle,
} from 'react-icons/fi'
import type { Platform, PlatformName } from '../../api/platforms'
import { Button, Card, StatusBadge } from '../../shell/design-system'

const PLATFORM_LABEL: Record<PlatformName, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok',
  fakestore: 'FakeStore (demo)',
  tokopedia: 'Tokopedia',
}

const PLATFORM_DESCRIPTION: Record<PlatformName, string> = {
  shopee: 'Integrasi marketplace Shopee',
  tiktok: 'Integrasi TikTok Shop',
  fakestore: 'Platform demo untuk pengujian',
  tokopedia: 'Integrasi marketplace Tokopedia',
}

/** Icon + tint kecil per platform -- BUKAN seluruh card ikut warna brand, cuma kotak icon-nya. */
const PLATFORM_ICON: Record<PlatformName, { Icon: typeof FiShoppingBag; className: string }> = {
  shopee: { Icon: FiShoppingBag, className: 'bg-orange-50 text-orange-600' },
  tiktok: { Icon: FiMusic, className: 'bg-slate-900 text-white' },
  fakestore: { Icon: FiBox, className: 'bg-violet-50 text-violet-600' },
  tokopedia: { Icon: FiShoppingCart, className: 'bg-green-50 text-green-600' },
}

export type PlatformActionType = 'connect' | 'sync' | 'disconnect'

interface PlatformCardProps {
  platform: Platform
  onConnect: () => void
  onSync: () => void
  onDisconnect: () => void
  /** Aksi mana yang lagi jalan buat platform INI -- null kalau gak ada. Murni presentation/loading state. */
  actioningAction: PlatformActionType | null
}

/**
 * Satu card platform (FR-OC-01) -- header (icon+nama+status), 2 info
 * block (toko, sinkronisasi), lalu actions. Business logic (kapan
 * connect/disconnect/sync API beneran dipanggil) TETAP tanggung jawab
 * ProductsPage/PlatformsPage lewat callback -- component ini murni
 * presentation.
 */
export function PlatformCard({ platform, onConnect, onSync, onDisconnect, actioningAction }: PlatformCardProps) {
  const { Icon, className: iconClassName } = PLATFORM_ICON[platform.platform_name]
  const isBusy = actioningAction !== null

  return (
    // h-full + flex-1 di block info di bawah -- biar tinggi card SAMA
    // rata dalam satu baris grid, dan actions selalu nempel di bagian
    // bawah card walau isi info-nya beda panjang (mis. platform yang
    // belum terhubung punya lebih sedikit info daripada yang udah
    // sync). Tanpa ini, card yang isinya lebih pendek bakal kelihatan
    // janggal -- tombol aksinya "ngambang" di posisi vertikal beda-beda
    // antar card.
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
            <Icon aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-800">{PLATFORM_LABEL[platform.platform_name]}</p>
            <p className="text-sm text-slate-500">{PLATFORM_DESCRIPTION[platform.platform_name]}</p>
          </div>
        </div>
        <StatusBadge label={platform.is_connected ? 'Terhubung' : 'Belum Terhubung'} tone={platform.is_connected ? 'success' : 'neutral'} />
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-3 border-t border-slate-100 pt-4">
        <div className="flex items-start gap-2">
          <FiMapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Toko Terhubung</p>
            {platform.shop_id_external ? (
              <p className="font-medium text-slate-700">{platform.shop_id_external}</p>
            ) : (
              <p className="text-sm text-slate-400">Belum ada toko yang terhubung</p>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <FiClock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Sinkronisasi Terakhir</p>
            {platform.last_synced_at ? (
              <>
                <p className="font-medium text-slate-700">{new Date(platform.last_synced_at).toLocaleString('id-ID')}</p>
                {platform.last_sync_status === 'success' && (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-sm text-green-600">
                    <FiCheckCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    Berhasil
                  </span>
                )}
                {platform.last_sync_status === 'failed' && (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-sm text-red-600">
                    <FiXCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    Gagal
                  </span>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">Belum pernah disinkronkan</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {platform.is_connected ? (
          <>
            <Button variant="secondary" isLoading={actioningAction === 'sync'} disabled={isBusy && actioningAction !== 'sync'} onClick={onSync}>
              <FiRefreshCw aria-hidden="true" />
              Sinkronkan
            </Button>
            <Button
              variant="secondary"
              className="border-red-200! text-red-600! hover:bg-red-50!"
              isLoading={actioningAction === 'disconnect'}
              disabled={isBusy && actioningAction !== 'disconnect'}
              onClick={onDisconnect}
            >
              <FiPower aria-hidden="true" />
              Putuskan
            </Button>
          </>
        ) : (
          <Button isLoading={actioningAction === 'connect'} disabled={isBusy && actioningAction !== 'connect'} onClick={onConnect}>
            <FiLink aria-hidden="true" />
            Hubungkan
          </Button>
        )}
      </div>
    </Card>
  )
}
