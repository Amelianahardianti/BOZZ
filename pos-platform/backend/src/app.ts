import express from 'express';
import { router as salesInventoryRouter } from './modules/sales-inventory';
import { router as ecommerceSyncRouter } from './modules/ecommerce-sync';
import { router as authProductRouter } from './modules/auth-product';

export const app = express();

app.use(express.json());

// Daftarkan router tiap modul sesuai prefix di contracts/api.yaml
app.use('/api', salesInventoryRouter);
app.use('/api', ecommerceSyncRouter);
app.use('/api', authProductRouter);

// Format error terpusat & seragam (SRS 9.7): { error: { code, message } }
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const status = err.status || 500;
    res.status(status).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Terjadi kesalahan pada server',
      },
    });
  }
);
