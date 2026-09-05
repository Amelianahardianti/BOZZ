// Satu pintu buat semua panggilan ke backend (contracts/api.yaml).
// Dipakai lewat fungsi per-domain (mis. api/auth.ts), bukan dipanggil
// fetch() langsung dari komponen -- biar format error & auth header
// konsisten di satu tempat.

import { notifyUnauthorized } from '../shell/auth/auth-context'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

/** Bentuk error backend, sesuai SRS 9.7: { error: { code, message } }. */
interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

/** Error yang sudah diterjemahkan dari response backend -- aman ditampilkan ke user. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string
  /** Header tambahan di luar Content-Type/Authorization, mis. Idempotency-Key (SRS 9.3). */
  headers?: Record<string, string>
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    // fetch gagal total (server mati, CORS, offline) -- bukan error
    // yang dikirim backend, jadi bentuknya disamain manual di sini.
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Tidak bisa terhubung ke server. Periksa koneksi kamu.')
  }

  if (res.status === 204) {
    return undefined as T
  }

  const data = (await res.json().catch(() => null)) as (ApiErrorBody & T) | null

  if (!res.ok) {
    // 401 di request yang MEMANG kekirim token berarti tokennya
    // ditolak beneran (kedaluwarsa/dicabut) -- beda sama 401 login
    // gagal (salah password), yang gak pernah kirim token sama
    // sekali. Cuma yang pertama yang berarti "sesi lagi aktif kok
    // tiba-tiba ditolak", jadi cuma itu yang micu auto-logout.
    if (res.status === 401 && options.token) {
      notifyUnauthorized()
    }

    throw new ApiRequestError(
      res.status,
      data?.error?.code ?? 'UNKNOWN_ERROR',
      data?.error?.message ?? 'Terjadi kesalahan yang tidak diketahui.',
    )
  }

  return data as T
}
