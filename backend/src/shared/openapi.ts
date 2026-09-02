// backend/src/shared/openapi.ts
//
// Menyajikan contracts/api.yaml sebagai Swagger UI. Spec-nya tetap satu
// sumber kebenaran di contracts/ (dipakai juga frontend & Postman), file
// ini cuma membacanya waktu boot — tidak ada salinan kedua yang bisa
// basi.

import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import { parse } from 'yaml';
import swaggerUi from 'swagger-ui-express';

// dist/ mencerminkan struktur src/ (rootDir src, outDir dist), jadi
// kedalaman folder ini sama saat dev (src/shared) maupun setelah build
// (dist/shared) — satu path cukup untuk keduanya.
const SPEC_PATH = path.resolve(__dirname, '../../../contracts/api.yaml');

export const router: Router = Router();

let spec: unknown;
try {
  spec = parse(fs.readFileSync(SPEC_PATH, 'utf8'));
} catch (err) {
  // Spec hilang/rusak tidak boleh menjatuhkan API-nya sendiri: dokumentasi
  // itu pelengkap, bukan syarat jalannya server.
  console.error(`[openapi] Gagal memuat ${SPEC_PATH}, /api/docs dinonaktifkan.`, err);
}

if (spec) {
  // Spec mentah, buat generator klien atau tooling lain.
  router.get('/docs.json', (_req, res) => {
    res.json(spec);
  });

  router.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'POS PWA API' }));
}
