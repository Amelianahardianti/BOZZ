import { fetchCategories } from '../../api/categories'
import { fetchAllProducts } from '../../api/products'
import { db, type CachedCategory, type CachedProduct } from './db'

/**
 * Tarik produk+kategori terbaru dari server, timpa cache lokal.
 * Panggil pas online (app start, reconnect, atau refresh manual) --
 * BUKAN dipanggil tiap kali mau baca produk, itu tugas
 * getCachedProducts() yang baca dari IndexedDB langsung (NFR-01).
 */
export async function syncProductCache(): Promise<void> {
  const [products, categories] = await Promise.all([fetchAllProducts(), fetchCategories()])
  const now = new Date().toISOString()

  await db.transaction('rw', db.products, db.categories, async () => {
    await db.products.clear()
    await db.products.bulkAdd(products.map((product) => ({ ...product, cachedAt: now })))

    await db.categories.clear()
    await db.categories.bulkAdd(categories.map((category) => ({ ...category, cachedAt: now })))
  })
}

/**
 * Baca produk dari cache lokal -- INSTAN, gak nunggu jaringan sama
 * sekali (NFR-01: aksi Kasir tetap responsif walau offline). Kalau
 * cache belum pernah di-sync, balikin array kosong (bukan error) --
 * pemanggil (Kasir Page nanti) yang mutusin mau nampilin apa.
 */
export async function getCachedProducts(): Promise<CachedProduct[]> {
  const all = await db.products.toArray()
  return all.filter((product) => product.is_active)
}

export async function getCachedCategories(): Promise<CachedCategory[]> {
  return db.categories.toArray()
}
