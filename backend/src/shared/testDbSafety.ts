// backend/src/shared/testDbSafety.ts

// Guard fail-closed -- Jest backend TIDAK PERNAH boleh menulis ke
// Supabase (dev/shared database), apa pun cara memanggilnya (`npm test`,
// `npx jest`, `npx jest test/x.test.ts`, `--runInBand`, dst).
//
// Root cause insiden sebelumnya: `npm test` aman karena
// `DOTENV_CONFIG_PATH=.env.test` di package.json, tapi `npx jest` langsung
// TIDAK membawa env var itu -- dotenv/config lantas memuat `.env` biasa
// (Supabase) tanpa ada yang mencegahnya. Package.json cuma pembungkus
// satu command, bukan jaminan.
//
// Fix-nya BUKAN nebak-nebak command apa yang dipakai, tapi memeriksa
// AKIBATnya: apa pun cara pemanggilan, begitu jest siap menyentuh DB,
// process.env.DATABASE_URL pasti sudah ke-resolve ke suatu nilai (dari
// .env.test kalau benar, dari .env kalau lupa) -- assertSafeTestDatabaseUrl
// memeriksa nilai HASIL AKHIR itu terhadap satu allow-list target Docker
// test DB yang sudah disepakati (docker-compose.yml + .env.test), bukan
// terhadap cara ia dimuat.
//
// Dipanggil dari DUA titik independen (defense-in-depth, bukan cuma satu
// command wrapper):
//   1. test/jest.global-setup.ts -- titik PALING AWAL yang ada: jalan
//      SEKALI sebelum worker mana pun start, sebelum test file mana pun
//      di-require. Kalau gagal di sini, TIDAK ADA test yang jalan sama
//      sekali (globalSetup gagal = seluruh run Jest gagal).
//   2. src/shared/db.ts -- titik PALING DEKAT ke koneksi database
//      sesungguhnya (Pool pg + PrismaClient dibuat di modul ini, SATU
//      pintu buat semua modul lain). Guard di sini hanya aktif kalau
//      `JEST_WORKER_ID` ke-set (env var yang SELALU disuntik Jest ke tiap
//      worker process, TIDAK PERNAH ada di `npm run dev`/produksi) --
//      supaya jalur dev/produksi normal tidak tersentuh sama sekali.

const ALLOWED_TEST_DB = {
  hosts: ['localhost', '127.0.0.1'],
  port: 5433,
  database: 'pos_platform',
} as const;

export class TestDatabaseSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestDatabaseSafetyError';
  }
}

/**
 * Lempar TestDatabaseSafetyError kalau `databaseUrl` bukan target Docker
 * test DB yang diizinkan. TIDAK PERNAH mencetak password/credential --
 * cuma host, port, dan nama database yang dibaca dari URL.
 */
export function assertSafeTestDatabaseUrl(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new TestDatabaseSafetyError(
      [
        'TEST DATABASE SAFETY CHECK FAILED',
        'DATABASE_URL tidak ter-set.',
        `Expected test target: host in [${ALLOWED_TEST_DB.hosts.join(', ')}], port ${ALLOWED_TEST_DB.port}, database "${ALLOWED_TEST_DB.database}"`,
        'Jalankan test lewat "npm test" (memuat .env.test otomatis), atau set DOTENV_CONFIG_PATH=.env.test eksplisit sebelum memanggil jest/npx jest.',
      ].join('\n')
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new TestDatabaseSafetyError(
      'TEST DATABASE SAFETY CHECK FAILED\nDATABASE_URL tidak bisa di-parse sebagai URL yang valid.'
    );
  }

  const detectedHost = parsed.hostname;
  const detectedPort = Number(parsed.port || 5432);
  const detectedDatabase = parsed.pathname.replace(/^\//, '');

  const hostOk = (ALLOWED_TEST_DB.hosts as readonly string[]).includes(detectedHost);
  const portOk = detectedPort === ALLOWED_TEST_DB.port;
  const dbOk = detectedDatabase === ALLOWED_TEST_DB.database;

  if (!hostOk || !portOk || !dbOk) {
    throw new TestDatabaseSafetyError(
      [
        'TEST DATABASE SAFETY CHECK FAILED',
        `Detected host: ${detectedHost}`,
        `Detected port: ${detectedPort}`,
        `Detected database: ${detectedDatabase}`,
        `Expected test target: host in [${ALLOWED_TEST_DB.hosts.join(', ')}], port ${ALLOWED_TEST_DB.port}, database "${ALLOWED_TEST_DB.database}"`,
        '',
        'Backend test HANYA boleh jalan melawan Docker Postgres lokal (docker-compose.yml, service "postgres").',
        'Supabase/dev database TIDAK PERNAH boleh menerima tulisan dari Jest.',
        'Jalankan lewat "npm test" (memuat .env.test otomatis), atau set DOTENV_CONFIG_PATH=.env.test eksplisit sebelum memanggil jest/npx jest.',
      ].join('\n')
    );
  }
}

/** true kalau proses ini adalah worker Jest (env var yang selalu disuntik Jest, tidak pernah ada di dev/produksi). */
export function isRunningUnderJest(): boolean {
  return process.env.JEST_WORKER_ID !== undefined;
}
