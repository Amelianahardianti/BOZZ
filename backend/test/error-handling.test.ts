// backend/test/error-handling.test.ts

// Menguji kontrak SRS 9.7: apa pun yang salah, response-nya selalu
// { error: { code, message } } dan selalu JSON — tidak pernah HTML,
// tidak pernah bocorin detail internal.
//
// File ini HANYA menguji middleware error-handling & RBAC, bukan logic
// auth-product yang sebenarnya (login/staff CRUD punya test sendiri di
// modulnya). Makanya modul repository.ts (satu-satunya titik ke
// database) di-mock total lewat jest.mock -- supaya test ini jalan
// cepat, tidak butuh koneksi Supabase, dan tidak numpuk data test ke
// DB beneran tiap kali dijalankan.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { app, toErrorResponse } from '../src/app';
import { AppError, badRequest, conflict } from '../src/shared/errors';
import * as repo from '../src/modules/auth-product/repository';
import { User } from '../src/modules/auth-product/repository';
import { tokenFor } from './helpers/auth';

jest.mock('../src/modules/auth-product/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.resetAllMocks();
});

/** Pastikan body-nya persis bentuk standar, bukan sekadar "mirip". */
function expectStandardShape(body: unknown): { code: string; message: string } {
  expect(Object.keys(body as object)).toEqual(['error']);
  const { error } = body as { error: { code: string; message: string } };
  expect(Object.keys(error).sort()).toEqual(['code', 'message']);
  expect(typeof error.code).toBe('string');
  expect(error.code.length).toBeGreaterThan(0);
  expect(typeof error.message).toBe('string');
  expect(error.message.length).toBeGreaterThan(0);
  return error;
}

/** User palsu buat isi mock repo -- tidak pernah ke database beneran. */
function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'mock-owner-id',
    name: 'Owner Uji',
    email_or_username: 'owner',
    password_hash: '$2a$10$tidakDipakaiLangsungDiTest.................',
    role: 'owner',
    phone: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('endpoint tidak dikenal', () => {
  it('membalas JSON NOT_FOUND, bukan halaman HTML bawaan Express', async () => {
    const res = await request(app).get('/api/tidak-ada');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(expectStandardShape(res.body).code).toBe('NOT_FOUND');
  });

  it('berlaku juga di luar prefix /api', async () => {
    const res = await request(app).post('/apa-pun');

    expect(res.status).toBe(404);
    expect(expectStandardShape(res.body).code).toBe('NOT_FOUND');
  });
});

describe('error dari middleware auth', () => {
  it('401 kalau header Authorization tidak ada', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(expectStandardShape(res.body).code).toBe('UNAUTHORIZED');
  });

  it('401 kalau token-nya ngawur', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token-palsu');

    expect(res.status).toBe(401);
    expect(expectStandardShape(res.body).code).toBe('UNAUTHORIZED');
  });

  it('403 kalau role-nya tidak berhak', async () => {
    // GET /api/staff cuma buat Owner. Role-nya sudah ada di JWT payload
    // (requireRole cek dari situ, bukan query ulang ke DB), jadi token
    // dipalsukan langsung lewat helper yang sama dipakai modul lain --
    // tidak perlu login beneran / bikin akun kasir ke database.
    const res = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${tokenFor('kasir')}`);

    expect(res.status).toBe(403);
    expect(expectStandardShape(res.body).code).toBe('FORBIDDEN');
  });
});

describe('error dari validasi input', () => {
  it('400 VALIDATION_ERROR dan menyebut field yang bermasalah', async () => {
    const res = await request(app).post('/api/auth/login').send({ email_or_username: 'owner' });

    expect(res.status).toBe(400);
    const error = expectStandardShape(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toContain('password');
  });

  it('400 VALIDATION_ERROR kalau body-nya bukan JSON valid', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ');

    expect(res.status).toBe(400);
    expect(expectStandardShape(res.body).code).toBe('VALIDATION_ERROR');
  });
});

describe('error yang dilempar service (bentuk object lama)', () => {
  it('tetap diterjemahkan ke bentuk standar', async () => {
    // Akunnya "ada" (lewat mock), tinggal password-nya yang salah --
    // bcrypt.compare terhadap hash acak di atas pasti gagal, jadi tidak
    // perlu bcrypt beneran buat memicu INVALID_CREDENTIALS.
    mockedRepo.findByEmailOrUsername.mockResolvedValue(buildUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email_or_username: 'owner', password: 'salah-banget' });

    expect(res.status).toBe(401);
    const error = expectStandardShape(res.body);
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.message).toBe('Username atau password salah.');
  });
});

describe('error tak terduga', () => {
  it('dibalas 500 generik tanpa membocorkan detail internal', () => {
    const bocor = new Error('connect ECONNREFUSED 10.1.2.3:5432 user=admin password=rahasia');
    const { status, body } = toErrorResponse(bocor);

    expect(status).toBe(500);
    const error = expectStandardShape(body);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('rahasia');
  });

  it('object lama dengan status 5xx juga ikut disamarkan', () => {
    const { status, body } = toErrorResponse({
      status: 503,
      code: 'DB_DOWN',
      message: 'pool exhausted di host internal-db-01',
    });

    expect(status).toBe(500);
    expect(expectStandardShape(body).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('internal-db-01');
  });

  it('yang di-throw bukan Error sama sekali tetap dapat bentuk standar', () => {
    for (const aneh of ['cuma string', 42, null, undefined, []]) {
      const { status, body } = toErrorResponse(aneh);
      expect(status).toBe(500);
      expect(expectStandardShape(body).code).toBe('INTERNAL_ERROR');
    }
  });
});

describe('error tak terduga lewat request sungguhan', () => {
  it('500 generik ke client, detail lengkapnya masuk log server', async () => {
    const pesanBocor = 'connect ECONNREFUSED 10.0.0.9:5432 password=SUPERRAHASIA';
    mockedRepo.findByEmailOrUsername.mockRejectedValue(new Error(pesanBocor));
    const logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email_or_username: 'owner', password: 'owner123' });

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(expectStandardShape(res.body).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('SUPERRAHASIA');

    // Client tidak dikasih detailnya, tapi kita harus tetap bisa
    // menelusuri masalahnya dari log.
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [label, dicatat] = logSpy.mock.calls[0];
    expect(label).toContain('POST /api/auth/login');
    expect(dicatat).toBeInstanceOf(Error);
    expect((dicatat as Error).message).toContain('SUPERRAHASIA');

    logSpy.mockRestore();
  });
});

describe('helper shared/errors.ts', () => {
  it('memetakan tiap code ke status HTTP yang benar', () => {
    expect(toErrorResponse(badRequest('x')).status).toBe(400);
    expect(toErrorResponse(conflict('Stok tidak cukup.')).status).toBe(409);
    expect(toErrorResponse(new AppError('NOT_FOUND', 'x')).status).toBe(404);
    expect(toErrorResponse(new AppError('UNAUTHORIZED', 'x')).status).toBe(401);
    expect(toErrorResponse(new AppError('FORBIDDEN', 'x')).status).toBe(403);
  });

  it('meneruskan pesan AppError apa adanya (aman dibaca user)', () => {
    const { body } = toErrorResponse(conflict('Stok tidak cukup.'));
    expect(expectStandardShape(body)).toEqual({ code: 'CONFLICT', message: 'Stok tidak cukup.' });
  });
});
