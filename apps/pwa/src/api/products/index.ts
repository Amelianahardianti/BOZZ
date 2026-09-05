import { readStoredSession } from '../../shell/auth/auth-context'
import { apiRequest, ApiRequestError } from '../client'

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

export interface PaginatedProducts {
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

function requireToken(): string {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login -- halaman Produk wajib login.')
  }
  return session.token
}

export interface FetchProductsParams {
  search?: string
  category_id?: string
  is_active?: boolean
  page?: number
  limit?: number
}

/** GET /api/products -- dibungkus {data, page, limit, total}, beda sama /orders yang array polos. */
export async function fetchProducts(params: FetchProductsParams = {}): Promise<PaginatedProducts> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.category_id) query.set('category_id', params.category_id)
  if (params.is_active !== undefined) query.set('is_active', String(params.is_active))
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const qs = query.toString()
  return apiRequest<PaginatedProducts>(`/products${qs ? `?${qs}` : ''}`, { token: requireToken() })
}

export interface CreateProductInput {
  name: string
  sku?: string
  category_id?: string
  price: number
  stock_qty: number
  low_stock_threshold?: number
  image_url?: string
  unit?: string
}

/** POST /api/products -- Owner. */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  return apiRequest<Product>('/products', { method: 'POST', body: input, token: requireToken() })
}

export interface UpdateProductInput {
  name?: string
  sku?: string | null
  category_id?: string | null
  price?: number
  low_stock_threshold?: number
  image_url?: string | null
  unit?: string | null
  is_active?: boolean
}

/** PATCH /api/products/:id -- Owner. JANGAN kirim stock_qty, backend nolak (400) -- pakai adjustStock(). */
export async function updateProduct(id: string, changes: UpdateProductInput): Promise<Product> {
  return apiRequest<Product>(`/products/${id}`, { method: 'PATCH', body: changes, token: requireToken() })
}

export interface StockAdjustment {
  id: string
  product_id: string
  change_qty: number
  reason: 'manual_adjustment' | 'restock'
  adjusted_by_user_id: string
  created_at: string
}

/** POST /api/products/:id/stock-adjustments -- Owner. Satu-satunya jalan ubah stok di luar checkout. */
export async function adjustStock(
  id: string,
  input: { change_qty: number; reason: 'manual_adjustment' | 'restock' },
): Promise<StockAdjustment> {
  return apiRequest<StockAdjustment>(`/products/${id}/stock-adjustments`, {
    method: 'POST',
    body: input,
    token: requireToken(),
  })
}

export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ImportJob {
  job_id: string
  status: ImportJobStatus
  filename: string
  total_rows: number | null
  created: number | null
  updated: number | null
  failed: number | null
  errors: unknown[]
  warnings: unknown[]
  message: string | null
  created_at: string
  finished_at: string | null
}

/**
 * POST /api/products/import -- Owner, multipart/form-data field "file",
 * .xlsx doang. Lewat apiRequest() gak bisa (dia SELALU JSON.stringify +
 * pasang Content-Type: application/json) -- fetch manual di sini,
 * biarin browser yang pasang Content-Type/boundary multipart-nya
 * sendiri. Format error disamain kayak apiRequest() (ApiRequestError)
 * biar caller di halaman Produk gak perlu tau bedanya.
 */
export async function startImport(file: File): Promise<{ job_id: string; status: ImportJobStatus }> {
  const session = readStoredSession()
  if (!session) {
    throw new Error('Dipanggil tanpa sesi login -- halaman Produk wajib login.')
  }

  const formData = new FormData()
  formData.append('file', file)

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/products/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
      body: formData,
    })
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Tidak bisa terhubung ke server. Periksa koneksi kamu.')
  }

  const data = (await res.json().catch(() => null)) as
    | { job_id: string; status: ImportJobStatus }
    | { error?: { code?: string; message?: string } }
    | null

  if (!res.ok) {
    const errBody = data as { error?: { code?: string; message?: string } } | null
    throw new ApiRequestError(
      res.status,
      errBody?.error?.code ?? 'UNKNOWN_ERROR',
      errBody?.error?.message ?? 'Terjadi kesalahan yang tidak diketahui.',
    )
  }

  return data as { job_id: string; status: ImportJobStatus }
}

/** GET /api/products/import/:jobId -- Owner. Poll ini abis startImport() sampai status terminal. */
export async function getImportJob(jobId: string): Promise<ImportJob> {
  return apiRequest<ImportJob>(`/products/import/${jobId}`, { token: requireToken() })
}
