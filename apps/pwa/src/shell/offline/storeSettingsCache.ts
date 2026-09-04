import { fetchStoreSettings } from '../../api/storeSettings'
import { db } from './db'

/**
 * Tarik profil toko terbaru dari server, timpa cache lokal. Panggil
 * pas online (app start, reconnect) -- BUKAN dipanggil tiap kali mau
 * baca, itu tugas getCachedStoreSettings() yang baca dari IndexedDB
 * langsung (NFR-01), sama pola-nya kayak productCache.ts.
 */
export async function syncStoreSettingsCache(): Promise<void> {
  const settings = await fetchStoreSettings()
  await db.storeSettings.put({ ...settings, cacheKey: 'current', cachedAt: new Date().toISOString() })
}

/**
 * Baca profil toko dari cache lokal -- INSTAN, gak nunggu jaringan.
 * null kalau belum pernah di-sync sama sekali (mis. baru install PWA
 * terus langsung offline) -- pemanggil (ReceiptView) yang mutusin mau
 * nampilin fallback apa.
 */
export async function getCachedStoreSettings() {
  return (await db.storeSettings.get('current')) ?? null
}
