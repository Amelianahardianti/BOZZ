import Dexie, { type EntityTable } from 'dexie'
import type { Category } from '../../api/categories'
import type { Product } from '../../api/products'
import type { StoreSettings } from '../../api/storeSettings'
import type { TransactionCreateRequest } from '../../api/transactions'

export type OutboxStatus = 'pending' | 'syncing' | 'failed'

export interface OutboxTransaction {
  /**
   * SENGAJA sama dengan Idempotency-Key yang dikirim ke backend (bukan
   * id terpisah) -- satu baris outbox = satu percobaan checkout unik,
   * dan ini juga yang bikin retry aman (SRS 9.3): key-nya udah fix
   * sejak transaksi di-antre, sync ulang wajib pakai key yang sama.
   */
  id: string
  kind: 'transaction'
  payload: TransactionCreateRequest
  status: OutboxStatus
  attempts: number
  lastError: string | null
  createdAt: string
}

export interface CachedProduct extends Product {
  cachedAt: string
}

export interface CachedCategory extends Category {
  cachedAt: string
}

/** Cuma ada SATU baris (satu toko, satu profil) -- cacheKey selalu 'current'. */
export interface CachedStoreSettings extends StoreSettings {
  cacheKey: 'current'
  cachedAt: string
}

/**
 * "Database" offline di browser (IndexedDB lewat Dexie -- SRS 4.2).
 * Tiga kepentingan:
 *  1. outboxTransactions -- antrian checkout yang belum sempat
 *     terkirim ke backend (FR-SI-06, NFR-02).
 *  2. products/categories -- salinan lokal buat dibaca instan tanpa
 *     nunggu jaringan (NFR-01: aksi Kasir harus tetap responsif
 *     offline).
 *  3. storeSettings -- profil toko (nama, alamat, logo) buat header
 *     struk, sama alasannya kayak products/categories di atas.
 */
export const db = new Dexie('pos-pwa') as Dexie & {
  outboxTransactions: EntityTable<OutboxTransaction, 'id'>
  products: EntityTable<CachedProduct, 'id'>
  categories: EntityTable<CachedCategory, 'id'>
  storeSettings: EntityTable<CachedStoreSettings, 'cacheKey'>
}

db.version(2).stores({
  outboxTransactions: 'id, status, createdAt',
  // is_active SENGAJA gak diindex -- boolean bukan tipe key yang sah
  // buat index IndexedDB (spesnya cuma izinin number/string/Date/
  // Array), jadi query is_active tetap lewat .toArray().filter() di
  // productCache.ts, bukan index.
  products: 'id, category_id, name',
  categories: 'id, name',
  storeSettings: 'cacheKey',
})
