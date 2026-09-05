import { useCallback, useEffect, useState } from 'react'
import { fetchNotifications } from '../../api/notifications'
import { useAuth } from '../auth/useAuth'

const POLL_INTERVAL_MS = 30_000
const CHANGED_EVENT = 'pos-pwa:notifications-changed'

/**
 * Panggil ini abis nandain notifikasi dibaca (satu atau semua) -- semua
 * instance useUnreadNotifications() yang lagi kepasang (badge di
 * AppShell TERMASUK, bukan cuma yang manggil ini) langsung refresh,
 * gak nunggu poll 30 detik berikutnya. Lewat window event (bukan
 * Context) biar gak perlu provider baru cuma buat satu angka ini.
 */
export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

/**
 * Jumlah notifikasi belum dibaca, buat badge di nav (AppShell) & halaman
 * Notifikasi. Di-poll tiap 30 detik pas login (fallback) + langsung
 * refresh begitu notifyNotificationsChanged() dipanggil dari mana pun
 * (mis. abis mark-as-read di NotificationsPage) -- gak ada infra
 * realtime (websocket/push) di project ini, dan Push Notification
 * Delivery (FR-FI-10) sendiri masih nunggu event dari modul A & B,
 * jadi kombinasi poll + event ringan ini cukup buat versi UI sekarang.
 */
export function useUnreadNotifications() {
  const { session } = useAuth()
  const [count, setCount] = useState(0)

  // setCount SELALU lewat callback promise (gak pernah sinkron di badan
  // efek) -- biar gak kena react-hooks/set-state-in-effect, termasuk
  // buat kasus "gak ada sesi" di bawah (Promise.resolve().then()).
  const refresh = useCallback(() => {
    if (!session) {
      Promise.resolve().then(() => setCount(0))
      return
    }
    fetchNotifications({ is_read: false, limit: 100 })
      .then((list) => setCount(list.length))
      .catch(() => {
        // Badge gagal fetch -- diemin aja, bukan error yang perlu
        // ditampilin ke user (bukan aksi yang mereka minta).
      })
  }, [session])

  useEffect(() => {
    refresh()
    if (!session) return
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    window.addEventListener(CHANGED_EVENT, refresh)
    return () => {
      clearInterval(interval)
      window.removeEventListener(CHANGED_EVENT, refresh)
    }
  }, [session, refresh])

  return { count, refresh }
}
