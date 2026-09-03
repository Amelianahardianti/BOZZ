import { useEffect, useState } from 'react'

/**
 * navigator.onLine gak selalu 100% akurat (bisa true walau internet
 * beneran mati, cuma link lokal nyala), tapi ini sinyal terbaik yang
 * browser sediakan tanpa nge-ping server tiap saat. Dipakai sebagai
 * heuristik "coba sync sekarang" -- kegagalan fetch beneran tetap
 * ditangani lewat retry di outbox.ts, jadi false-positive di sini
 * gak bikin data hilang, paling cuma nyoba sync yang gagal lalu retry.
 */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

/** @returns fungsi unsubscribe. */
export function subscribeToConnectivity(onChange: (online: boolean) => void): () => void {
  function handleOnline() {
    onChange(true)
  }
  function handleOffline() {
    onChange(false)
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}

/** Hook React buat nampilin badge "offline" dll di UI shell. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline)

  useEffect(() => subscribeToConnectivity(setOnline), [])

  return online
}
