// backend/src/modules/ecommerce-sync/routes.ts
// Endpoint sesuai contracts/api.yaml tag Platforms/Webhooks/Orders/Customers.

import { Router, Request } from 'express';
import { z } from 'zod';
import * as service from './service';
import { asyncHandler, badRequest } from '../../shared/errors';
import { requireAuth, requireRole } from '../../shared/middleware/auth';

export const router = Router();

// ---------- GET /api/platforms ----------
router.get(
  '/platforms',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (_req, res) => {
    res.status(200).json(await service.listPlatforms());
  })
);

// ---------- POST /api/platforms/:platform/connect ----------
const connectSchema = z.object({
  api_key: z.string().optional(),
  api_secret: z.string().optional(),
  oauth_code: z.string().optional(),
  shop_id: z.string().optional(),
});

router.post(
  '/platforms/:platform/connect',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const body = connectSchema.parse(req.body ?? {});
    const result = await service.connectPlatform(req.params.platform, body.oauth_code, body.shop_id);
    res.status(200).json(result);
  })
);

// Bukan bagian resmi contracts/api.yaml (dokumen itu asumsi frontend yang
// bangun authorization URL sendiri) — endpoint tambahan ini cuma buat
// testing manual: buka link ini di browser buat dapetin oauth_code.
router.get(
  '/platforms/:platform/authorize-url',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    res.status(200).json({ authorizationUrl: service.getAuthorizationUrl(req.params.platform) });
  })
);

// ---------- POST /api/platforms/:platform/disconnect ----------
router.post(
  '/platforms/:platform/disconnect',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    res.status(200).json(await service.disconnectPlatform(req.params.platform));
  })
);

// ---------- POST /api/platforms/:platform/sync ----------
router.post(
  '/platforms/:platform/sync',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const result = await service.syncPlatform(req.params.platform);
    res.status(202).json(result);
  })
);

// ---------- POST /api/webhooks/:platform ----------
// security: [] di api.yaml — publik dari sisi HTTP, tapi wajib verifikasi
// signature (SRS 9.5). Balas 2xx cepat, proses async.
router.post(
  '/webhooks/:platform',
  asyncHandler(async (req: Request & { rawBody?: Buffer }, res) => {
    const rawBody = (req.rawBody ?? Buffer.from(JSON.stringify(req.body))).toString('utf8');
    const headers = req.headers as Record<string, string | string[] | undefined>;

    // Verifikasi dilakukan SEBELUM balas 200 (kontrak: 401 kalau signature
    // invalid) — bedanya dengan proses detail order, yang baru async setelahnya.
    res.status(200).json({ received: true });

    try {
      await service.handleWebhook(req.params.platform, rawBody, headers, req.body);
    } catch (err) {
      console.error(`[ecommerce-sync] webhook ${req.params.platform} gagal diproses:`, err);
    }
  })
);

// ---------- GET /api/orders ----------
const listOrdersQuerySchema = z.object({
  platform_id: z.string().uuid().optional(),
  status: z.enum(['new', 'processing', 'shipped', 'completed', 'cancelled']).optional(),
  sla_type: z.enum(['instant', 'same_day', 'reguler']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get(
  '/orders',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const query = listOrdersQuerySchema.parse(req.query);
    const orders = await service.listOrders({
      platformId: query.platform_id,
      status: query.status,
      slaType: query.sla_type,
      page: query.page,
      limit: query.limit,
    });
    res.status(200).json(orders);
  })
);

// ---------- GET /api/orders/:id ----------
router.get(
  '/orders/:id',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    res.status(200).json(await service.getOrderDetail(req.params.id));
  })
);

// ---------- PATCH /api/orders/:id/status ----------
const updateStatusSchema = z.object({
  status: z.enum(['new', 'processing', 'shipped', 'completed', 'cancelled']),
});

router.patch(
  '/orders/:id/status',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const body = updateStatusSchema.parse(req.body);
    res.status(200).json(await service.updateOrderStatus(req.params.id, body.status));
  })
);

// ---------- GET /api/customers/search ----------
router.get(
  '/customers/search',
  requireAuth,
  requireRole('owner', 'kasir'),
  asyncHandler(async (req, res) => {
    const q = req.query.q;
    if (typeof q !== 'string' || !q.trim()) throw badRequest("Query parameter 'q' wajib diisi.");
    res.status(200).json(await service.searchCustomers(q));
  })
);
