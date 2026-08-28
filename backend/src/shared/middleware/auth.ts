// backend/src/shared/middleware/auth.ts

// Ini "satpam" yang jaga tiap endpoint. Dipakai bukan cuma di modul
// auth-product, tapi juga dipanggil sama modul sales-inventory dan
// ecommerce-sync buat ngelindungin endpoint mereka sendiri.
//
// Cara pakai di modul lain, contoh:
//
//   import { requireAuth, requireRole } from '../../shared/middleware/auth';
//   router.post('/products', requireAuth, requireRole('owner'), handler);

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-ganti-di-production';

export type Role = 'owner' | 'kasir' | 'pengepak';

// Nambahin info user yang lagi login ke object request Express,
// supaya endpoint di belakangnya bisa tau siapa yang lagi akses.
export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: Role };
}

// Langkah 1: cek ada token yang valid atau tidak (user sudah login apa belum).
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Harus login dulu.' },
    });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; role: Role };
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Sesi login tidak valid atau sudah habis.' },
    });
  }
}

// Langkah 2 (opsional, dipasang SETELAH requireAuth): cek role-nya
// sesuai atau tidak. Contoh: requireRole('owner') artinya cuma Owner
// yang boleh lewat.
export function requireRole(...allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Harus login dulu.' },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Kamu tidak punya akses ke halaman/fitur ini.' },
      });
    }

    next();
  };
}