// backend/src/app.ts

import express from 'express';
import { ZodError } from 'zod';
import { router as salesInventoryRouter } from './modules/sales-inventory';
import { router as ecommerceSyncRouter } from './modules/ecommerce-sync';
import { router as authProductRouter } from './modules/auth-product';

export const app = express();

app.use(express.json());

// Daftarkan router tiap modul sesuai prefix di contracts/api.yaml
app.use('/api', salesInventoryRouter);
app.use('/api', ecommerceSyncRouter);
app.use('/api', authProductRouter);

interface AppError extends Error {
  status?: number;
  code?: string;
}

// Format error terpusat & seragam (SRS 9.7): { error: { code, message } }
app.use(
  (
    err: AppError | ZodError,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    // Kalau errornya dari validasi zod (input request salah bentuk),
    // kasih pesan yang lebih jelas ke pengirim request.
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        },
      });
      return;
    }

    const status = err.status || 500;
    res.status(status).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Terjadi kesalahan pada server',
      },
    });
  }
);