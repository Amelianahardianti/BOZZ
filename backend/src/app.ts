// backend/src/app.ts

import cors from 'cors';
import express, { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode, notFound } from './shared/errors';
import { router as salesInventoryRouter } from './modules/sales-inventory';
import { router as ecommerceSyncRouter } from './modules/ecommerce-sync';
import { router as authProductRouter } from './modules/auth-product';
import { router as openapiRouter } from './shared/openapi';

export const app = express();

// PWA (apps/pwa) dideploy terpisah dari backend ini (Cloudflare
// Pages/Vercel vs Render -- SRS 4.2), jadi request-nya lintas origin.
// Default-nya cukup buat dev lokal; pas deploy production, set
// CORS_ORIGIN di env ke domain PWA yang sebenarnya (boleh lebih dari
// satu, pisahkan pakai koma).
const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: corsOrigins }));

// rawBody disimpan buat verifikasi signature webhook (ecommerce-sync) —
// JSON.stringify(req.body) tidak dijamin identik byte-per-byte dengan body
// asli yang ditandatangani platform.
app.use(
  express.json({
    // Default express.json() cuma 100kb -- kepentok kalau body-nya logo
    // toko base64 (lihat cap 700_000 char di auth-product/routes.ts,
    // ~525KB kalau di-decode). 1mb dikasih longgar dikit di atas itu.
    limit: '1mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Swagger UI di /api/docs. Didaftarkan sebelum router modul supaya jelas
// prefix ini bukan milik salah satu modul, dan jauh sebelum jaring
// not-found di bawah.
app.use('/api', openapiRouter);

// Daftarkan router tiap modul sesuai prefix di contracts/api.yaml
app.use('/api', salesInventoryRouter);
app.use('/api', ecommerceSyncRouter);
app.use('/api', authProductRouter);

// Jaring terakhir untuk URL yang tidak cocok ke router mana pun. Tanpa
// ini Express membalas halaman HTML "Cannot GET /..." — frontend yang
// mengharapkan JSON akan gagal parse dan errornya jadi membingungkan.
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(notFound(`Endpoint tidak ditemukan: ${req.method} ${req.path}`));
});

// ---------------------------------------------------------------------
// Error handler pusat (SRS 9.7)
//
// SATU-SATUNYA tempat di backend yang boleh merakit response error.
// Semua modul cukup throw/next(error), bentuk JSON-nya diseragamkan di
// sini jadi { error: { code, message } } sesuai contracts/api.yaml.
// ---------------------------------------------------------------------

interface ErrorResponse {
  error: { code: ErrorCode | string; message: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Error dari body-parser (express.json) saat body request bukan JSON
 * valid atau kegedean. Ini salah pengirim request, jadi 400 — bukan 500.
 */
function isBodyParserError(err: unknown): boolean {
  return isRecord(err) && typeof err.type === 'string' && err.type.startsWith('entity.');
}

/**
 * Terjemahkan apa pun yang di-throw jadi status + body yang seragam.
 * Dipisah dari app.use biar gampang dibaca dan dites — di-export khusus
 * supaya test bisa mengecek pemetaannya tanpa harus lewat HTTP.
 */
export function toErrorResponse(err: unknown): { status: number; body: ErrorResponse } {
  // 1. Input gagal validasi zod — sebutkan field mana yang bermasalah
  //    supaya user tahu harus benerin apa.
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        },
      },
    };
  }

  // 2. Error yang sengaja dilempar modul lewat shared/errors.ts.
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }

  // 3. Body request tidak bisa di-parse.
  if (isBodyParserError(err)) {
    return {
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Body request bukan JSON yang valid.' } },
    };
  }

  // 4. Bentuk lama: `throw { status, code, message }` (object biasa,
  //    bukan Error). Masih didukung supaya kode yang sudah ada tidak
  //    rusak, tapi untuk kode baru pakai helper di shared/errors.ts.
  if (isRecord(err) && typeof err.code === 'string' && typeof err.message === 'string') {
    const status = typeof err.status === 'number' ? err.status : 500;
    if (status < 500) {
      return { status, body: { error: { code: err.code, message: err.message } } };
    }
  }

  // 5. Sisanya = tidak terduga (bug, DB mati, dll). Pesan aslinya TIDAK
  //    dikirim ke client karena bisa bocorin detail internal seperti
  //    query SQL atau host database. Detail lengkapnya masuk log server.
  return {
    status: 500,
    body: {
      error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server.' },
    },
  };
}

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  // Kalau response sudah terlanjur dikirim sebagian, header tidak bisa
  // diubah lagi. Serahkan ke Express supaya koneksinya ditutup benar.
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, body } = toErrorResponse(err);

  // Error 5xx berarti ada yang salah di kita, bukan di pengirim request.
  // Wajib dicatat lengkap, karena client cuma dapat pesan generik.
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json(body);
});
