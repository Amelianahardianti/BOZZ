// backend/src/modules/dashboard/routes.ts

import { Router } from 'express';
import * as service from './service';
import { asyncHandler } from '../../shared/errors';
import { requireAuth, requireRole } from '../../shared/middleware/auth';

export const router = Router();

// ---------- GET /api/dashboard ----------
// Owner-only: ringkasan operasional read-only. Kasir/pengepak tidak
// butuh (dan tidak boleh melihat) angka bisnis lintas-domain ini.
router.get(
  '/dashboard',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (_req, res) => {
    res.status(200).json(await service.getDashboard());
  })
);
