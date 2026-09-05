import { readStoredSession } from '../shell/auth/auth-context'
import { apiRequest } from './client'

/** Cerminan #/components/schemas/Product di contracts/api.yaml. */
export interface Product {
  id: string
  category_id: string | null
  category_name: string | null
  name: string
  sku: string | null
  price: number
  cost_price: number | null
  stock_qty: number
  low_stock_threshold: number
  image_url: string | null
  unit: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

interface PaginatedProducts {
  data: Product[]
  page: number
  limit: number
  total: number
}

const PAGE_SIZE = 100
/** Jaga-jaga biar gak infinite loop kalau `total` dari server aneh. */
const MAX_PAGES = 100

/**
 * Narik SEMUA produk (lintas halaman), buat diisi ke cache offline
 * (shell/offline/productCache.ts) -- BUKAN dipakai langsung buat
 * nampilin daftar produk paginated di UI biasa.
 */
export async function fetchAllProducts(): Promise<Product[]> {
  const session = readStoredSession()
  if (!session) return []

  const all: Product[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await apiRequest<PaginatedProducts>(`/products?page=${page}&limit=${PAGE_SIZE}`, {
      token: session.token,
    })
    all.push(...result.data)
    if (result.data.length < PAGE_SIZE || all.length >= result.total) break
  }

  return all
}
