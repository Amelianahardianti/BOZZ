import { useEffect, useState } from 'react'
import { fetchNotifications, markNotificationRead, type Notification } from '../../api/notifications'
import { ApiRequestError } from '../../api/client'
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../../shell/design-system'
import { notifyNotificationsChanged } from '../../shell/notifications/useUnreadNotifications'

type Filter = 'all' | 'unread'

const REFERENCE_LABEL: Record<string, string> = {
  external_order: 'Pesanan Masuk',
  ticket: 'Ticket',
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [isMarkingAll, setIsMarkingAll] = useState(false)

  function load(currentFilter: Filter) {
    setIsLoading(true)
    setLoadError(null)
    fetchNotifications({ is_read: currentFilter === 'unread' ? false : undefined, limit: 100 })
      .then(setNotifications)
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat notifikasi.')
      })
      .finally(() => setIsLoading(false))
  }

  // SATU chain promise, termasuk reset isLoading/loadError-nya lewat
  // .then() (bukan dipanggil sinkron di badan efek) -- biar gak kena
  // react-hooks/set-state-in-effect. Beda sama loadStaff() di
  // StaffPage.tsx yang gak butuh reset karena efeknya cuma jalan sekali
  // pas mount; di sini efeknya jalan ulang tiap `filter` ganti.
  useEffect(() => {
    Promise.resolve()
      .then(() => {
        setIsLoading(true)
        setLoadError(null)
        return fetchNotifications({ is_read: filter === 'unread' ? false : undefined, limit: 100 })
      })
      .then(setNotifications)
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiRequestError ? err.message : 'Gagal memuat notifikasi.')
      })
      .finally(() => setIsLoading(false))
  }, [filter])

  async function handleMarkRead(notif: Notification) {
    if (notif.is_read) return
    try {
      const updated = await markNotificationRead(notif.id)
      setNotifications((prev) =>
        filter === 'unread' ? prev.filter((n) => n.id !== notif.id) : prev.map((n) => (n.id === notif.id ? updated : n)),
      )
      notifyNotificationsChanged()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal menandai notifikasi sudah dibaca.')
    }
  }

  async function handleMarkAllRead() {
    const unread = notifications.filter((n) => !n.is_read)
    if (unread.length === 0) return

    setIsMarkingAll(true)
    try {
      await Promise.all(unread.map((n) => markNotificationRead(n.id)))
      load(filter)
      notifyNotificationsChanged()
    } catch (err) {
      window.alert(err instanceof ApiRequestError ? err.message : 'Gagal menandai semua notifikasi sudah dibaca.')
    } finally {
      setIsMarkingAll(false)
    }
  }

  const hasUnread = notifications.some((n) => !n.is_read)

  return (
    <>
      <PageHeader
        title="Notifikasi"
        description="Update pesanan masuk & ticket packing (FR-FI-10)."
        actions={
          hasUnread ? (
            <Button variant="secondary" disabled={isMarkingAll} onClick={handleMarkAllRead}>
              {isMarkingAll ? 'Menandai...' : 'Tandai Semua Dibaca'}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(['all', 'unread'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              filter === f ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {f === 'all' ? 'Semua' : 'Belum Dibaca'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : loadError ? (
        <ErrorState description={loadError} />
      ) : notifications.length === 0 ? (
        <EmptyState
          title={filter === 'unread' ? 'Gak ada notifikasi belum dibaca' : 'Belum ada notifikasi'}
          description={
            filter === 'unread'
              ? 'Semua notifikasi udah dibaca.'
              : 'Notifikasi soal pesanan masuk & ticket packing bakal muncul di sini.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((notif) => (
            <Card
              key={notif.id}
              className={`${notif.is_read ? '' : 'cursor-pointer border-brand-200 bg-brand-50/60'}`}
            >
              <button
                type="button"
                onClick={() => handleMarkRead(notif)}
                disabled={notif.is_read}
                className="flex w-full flex-col gap-1 text-left disabled:cursor-default"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm ${notif.is_read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>
                    {!notif.is_read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-600" />}
                    {notif.title}
                  </p>
                  {notif.reference_type && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                      {REFERENCE_LABEL[notif.reference_type] ?? notif.reference_type}
                    </span>
                  )}
                </div>
                {notif.message && <p className="text-sm text-slate-500">{notif.message}</p>}
                <p className="text-xs text-slate-400">{new Date(notif.created_at).toLocaleString('id-ID')}</p>
              </button>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
