// backend/src/shared/errors.ts

// Perkakas error bersama untuk 3 modul. Tujuannya satu: bentuk response
// error { error: { code, message } } (SRS 9.7, contracts/api.yaml
// #/components/schemas/Error) hanya dirakit di SATU tempat, yaitu error
// handler pusat di app.ts.
//
// Aturan mainnya buat semua modul:
//   - JANGAN bikin res.status(...).json({ error: ... }) sendiri di
//     routes/middleware. Begitu ada 2 tempat yang merakit bentuk ini,
//     suatu saat pasti beda dan frontend yang jadi korban.
//   - Cukup `throw` (atau `next(...)`) salah satu error di bawah, nanti
//     app.ts yang menerjemahkan jadi HTTP response.
//
// Contoh:
//   import { notFound, conflict, asyncHandler } from '../../shared/errors';
//   if (!produk) throw notFound('Produk tidak ditemukan.');
//   if (stok < qty) throw conflict('Stok tidak cukup.');

import { Request, Response, NextFunction } from 'express';

/**
 * Daftar code error yang dipakai seluruh backend. Sengaja dibatasi
 * (bukan string bebas) supaya frontend bisa `switch` dengan yakin.
 * Mau nambah code baru? Sepakati bertiga dulu + update contracts/api.yaml.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

/** HTTP status default tiap code, biar tidak beda-beda antar modul. */
const STATUS_DEFAULT: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

/**
 * Error yang "diniatkan" — artinya kondisi ini sudah diperkirakan dan
 * pesannya memang aman dibaca user. Beda dengan error tak terduga
 * (bug/DB mati) yang pesannya akan disembunyikan oleh app.ts.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status ?? STATUS_DEFAULT[code];
  }
}

// ---- Pintasan biar enak dipakai di service/routes ----

/** 400 — input dari user salah bentuk/tidak masuk akal. */
export const badRequest = (message: string): AppError => new AppError('VALIDATION_ERROR', message);

/** 401 — belum login, token invalid, atau username/password salah. */
export const unauthorized = (message = 'Harus login dulu.'): AppError =>
  new AppError('UNAUTHORIZED', message);

/** 403 — sudah login tapi role-nya tidak berhak. */
export const forbidden = (message = 'Kamu tidak punya akses ke halaman/fitur ini.'): AppError =>
  new AppError('FORBIDDEN', message);

/** 404 — data/endpoint tidak ada. */
export const notFound = (message = 'Data tidak ditemukan.'): AppError =>
  new AppError('NOT_FOUND', message);

/** 409 — bentrok dengan kondisi sekarang, misal stok tidak cukup. */
export const conflict = (message: string): AppError => new AppError('CONFLICT', message);

/**
 * Bungkus handler async supaya error-nya nyampe ke error handler pusat.
 *
 * WAJIB dipakai untuk SEMUA route async. Express 4 tidak menangkap
 * promise yang reject — tanpa bungkus ini, request-nya menggantung
 * sampai timeout dan prosesnya bisa mati kena unhandled rejection.
 *
 *   router.get('/produk', asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}
