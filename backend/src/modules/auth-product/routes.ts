// backend/src/modules/auth-product/routes.ts

// Di sinilah alamat URL (endpoint) didaftarkan, sesuai contracts/api.yaml.
// File ini cuma "penerima tamu": terima request, cek bentuknya bener
// apa nggak (pakai zod), lempar ke service.ts buat diproses, lalu
// balikin hasilnya. Logic beneran ada di service.ts, bukan di sini.

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './service';
import { requireAuth, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth';

export const router = Router();

// Helper kecil: bungkus function async supaya errornya otomatis
// ketangkep sama error handler pusat di app.ts (SRS 9.7).
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ---------- POST /api/auth/login ----------
const loginSchema = z.object({
  email_or_username: z.string().min(1),
  password: z.string().min(1),
});

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await service.login(body.email_or_username, body.password);
    res.status(200).json(result);
  })
);

// ---------- POST /api/auth/logout ----------
router.post('/auth/logout', requireAuth, (_req, res) => {
  // Karena pakai JWT (stateless), "logout" cukup dihandle di sisi
  // frontend (hapus token yang disimpan). Endpoint ini disiapkan
  // buat jaga-jaga kalau nanti mau nambah token blacklist.
  res.status(204).send();
});

// ---------- GET /api/auth/me ----------
router.get(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const me = await service.getMe(req.user!.id);
    res.status(200).json(me);
  })
);

// ---------- GET /api/staff ----------
router.get(
  '/staff',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (_req, res) => {
    const staff = await service.listStaff();
    res.status(200).json({ data: staff, page: 1, limit: staff.length, total: staff.length });
  })
);

// ---------- POST /api/staff ----------
const createStaffSchema = z.object({
  name: z.string().min(1),
  email_or_username: z.string().min(1),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.enum(['kasir', 'pengepak']),
  phone: z.string().optional(),
});

router.post(
  '/staff',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createStaffSchema.parse(req.body);
    const newStaff = await service.createStaff({
      ...body,
      createdByUserId: req.user!.id,
    });
    res.status(201).json(newStaff);
  })
);

// ---------- PATCH /api/staff/:id ----------
const updateStaffSchema = z.object({
  name: z.string().min(1).optional(),
  email_or_username: z.string().min(1).optional(),
  role: z.enum(['kasir', 'pengepak']).optional(),
  phone: z.string().optional(),
});

router.patch(
  '/staff/:id',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const body = updateStaffSchema.parse(req.body);
    const updated = await service.updateStaff(req.params.id, body);
    res.status(200).json(updated);
  })
);

// ---------- PATCH /api/staff/:id/deactivate ----------
router.patch(
  '/staff/:id/deactivate',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const updated = await service.deactivateStaff(req.params.id);
    res.status(200).json(updated);
  })
);