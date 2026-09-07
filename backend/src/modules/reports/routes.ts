// backend/src/modules/reports/routes.ts

import { Router } from 'express';
import { z } from 'zod';
import * as service from './service';
import { asyncHandler } from '../../shared/errors';
import { requireAuth, requireRole } from '../../shared/middleware/auth';

export const router = Router();

// Nama param & validasi PERSIS sama seperti GET /transactions
// (sales-inventory/routes.ts) -- date_from/date_to, format YYYY-MM-DD,
// date_to gak boleh lebih awal dari date_from. Dipertahankan konsisten
// (bukan startDate/endDate) sesuai audit Task 13A.
const tanggal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'tanggal harus format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'tanggal tidak valid');

const salesReportQuerySchema = z
  .object({
    date_from: tanggal.optional(),
    date_to: tanggal.optional(),
  })
  .refine((q) => !q.date_from || !q.date_to || q.date_from <= q.date_to, {
    path: ['date_to'],
    message: 'date_to tidak boleh lebih awal dari date_from',
  });

// ---------- GET /api/reports/sales ----------
router.get(
  '/reports/sales',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const query = salesReportQuerySchema.parse(req.query);
    const report = await service.getSalesReport({ dateFrom: query.date_from, dateTo: query.date_to });
    res.status(200).json(report);
  })
);

// ---------- GET /api/reports/sales/export.xlsx ----------
// CSV di-generate di FRONTEND langsung dari response di atas (read-only,
// tanpa endpoint baru -- lihat brief section 20). Excel BEDA: file
// binary .xlsx tidak bisa dirakit valid di browser tanpa dependency baru
// di frontend, jadi di-generate di sini pakai ExcelJS yang SUDAH ADA
// (dipakai product-import, bukan dependency baru -- lihat service.ts).
router.get(
  '/reports/sales/export.xlsx',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const query = salesReportQuerySchema.parse(req.query);
    const buffer = await service.exportSalesReportExcel({ dateFrom: query.date_from, dateTo: query.date_to });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-report.xlsx"');
    res.status(200).send(buffer);
  })
);
