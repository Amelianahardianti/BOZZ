// backend/test/auth.test.ts

// Menguji endpoint modul auth-product sesuai contracts/api.yaml &
// tabel akses SRS 8.3.3: login, logout, me, staff CRUD, store-settings.
//
// Dependency ke database (repository.ts) di-mock total -- sama kayak
// pola di error-handling.test.ts -- karena modul ini yang megang tabel
// users, jadi wajar tokennya sendiri yang diuji login-nya beneran
// (bukan cuma dipalsuin kayak test modul lain lewat helpers/auth.ts).

import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app';
import * as repo from '../src/modules/auth-product/repository';
import type { StoreSettings, User } from '../src/modules/auth-product/repository';
import { kasirToken, ownerToken, staffToken } from './helpers/auth';
import { describe, expect, it, jest, afterEach } from '@jest/globals';

jest.mock('../src/modules/auth-product/repository');
const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.resetAllMocks();
});

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Owner Toko',
    email_or_username: 'owner',
    password_hash: bcrypt.hashSync('owner123', 10),
    role: 'owner',
    phone: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function buildStoreSettings(overrides: Partial<StoreSettings> = {}): StoreSettings {
  return {
    id: 'settings-1',
    business_name: 'Toko Saya',
    address: null,
    phone: null,
    receipt_footer_note: null,
    logo_url: null,
    updated_by: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('POST /api/auth/login -- Publik', () => {
  it('200 + token & user (tanpa password_hash) kalau kredensial benar', async () => {
    mockedRepo.findByEmailOrUsername.mockResolvedValue(buildUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email_or_username: 'owner', password: 'owner123' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email_or_username).toBe('owner');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('401 kalau password salah', async () => {
    mockedRepo.findByEmailOrUsername.mockResolvedValue(buildUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email_or_username: 'owner', password: 'salah-banget' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('401 kalau akunnya gak ada', async () => {
    mockedRepo.findByEmailOrUsername.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email_or_username: 'siapa-ini', password: 'apapun' });

    expect(res.status).toBe(401);
  });

  it('401 kalau akunnya sudah dinonaktifkan (login tetap ditolak walau password benar)', async () => {
    mockedRepo.findByEmailOrUsername.mockResolvedValue(buildUser({ is_active: false }));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email_or_username: 'owner', password: 'owner123' });

    expect(res.status).toBe(401);
  });

  it('gak perlu token sama sekali -- endpoint publik', async () => {
    mockedRepo.findByEmailOrUsername.mockResolvedValue(buildUser());

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email_or_username: 'owner', password: 'owner123' });

    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/logout -- Semua role', () => {
  it('204 buat Owner', async () => {
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${ownerToken()}`);
    expect(res.status).toBe(204);
  });

  it('204 buat Kasir', async () => {
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${kasirToken()}`);
    expect(res.status).toBe(204);
  });

  it('204 buat Pengepak', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`);
    expect(res.status).toBe(204);
  });

  it('401 tanpa token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me -- Semua role', () => {
  it('200 buat Owner, balikin data akunnya sendiri tanpa password_hash', async () => {
    mockedRepo.findById.mockResolvedValue(buildUser({ role: 'owner' }));

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('owner');
    expect(res.body.password_hash).toBeUndefined();
  });

  it('200 buat Kasir', async () => {
    mockedRepo.findById.mockResolvedValue(buildUser({ role: 'kasir' }));

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${kasirToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('kasir');
  });

  it('200 buat Pengepak', async () => {
    mockedRepo.findById.mockResolvedValue(buildUser({ role: 'pengepak' }));

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('pengepak');
  });

  it('401 tanpa token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 kalau akunnya udah gak ada di DB (mis. token lama, akun kehapus)', async () => {
    mockedRepo.findById.mockResolvedValue(null);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/staff -- Owner', () => {
  it('200 buat Owner', async () => {
    mockedRepo.listStaff.mockResolvedValue([buildUser()]);

    const res = await request(app).get('/api/staff').set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].password_hash).toBeUndefined();
  });

  it('403 buat Kasir', async () => {
    const res = await request(app).get('/api/staff').set('Authorization', `Bearer ${kasirToken()}`);
    expect(res.status).toBe(403);
  });

  it('403 buat Pengepak', async () => {
    const res = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`);
    expect(res.status).toBe(403);
  });

  it('401 tanpa token', async () => {
    const res = await request(app).get('/api/staff');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/staff -- Owner', () => {
  const body = { name: 'Budi', email_or_username: 'budi', password: 'budi123', role: 'kasir' as const };

  it('201 buat Owner', async () => {
    mockedRepo.findByEmailOrUsername.mockResolvedValue(null);
    mockedRepo.createUser.mockResolvedValue(buildUser({ ...body, id: 'new-1' }));

    const res = await request(app).post('/api/staff').set('Authorization', `Bearer ${ownerToken()}`).send(body);

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('kasir');
    expect(res.body.password_hash).toBeUndefined();
  });

  it('403 buat Kasir', async () => {
    const res = await request(app).post('/api/staff').set('Authorization', `Bearer ${kasirToken()}`).send(body);
    expect(res.status).toBe(403);
  });

  it('403 buat Pengepak', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`)
      .send(body);
    expect(res.status).toBe(403);
  });

  it('400 kalau nyoba bikin role owner (cuma boleh kasir/pengepak)', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ ...body, role: 'owner' });

    expect(res.status).toBe(400);
  });

  it('400 kalau username udah dipakai', async () => {
    mockedRepo.findByEmailOrUsername.mockResolvedValue(buildUser());

    const res = await request(app).post('/api/staff').set('Authorization', `Bearer ${ownerToken()}`).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 kalau password kurang dari 6 karakter', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ ...body, password: '123' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/staff/:id -- Owner', () => {
  it('200 buat Owner', async () => {
    mockedRepo.updateUser.mockResolvedValue(buildUser({ name: 'Nama Baru' }));

    const res = await request(app)
      .patch('/api/staff/some-id')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Nama Baru' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Nama Baru');
  });

  it('403 buat Kasir', async () => {
    const res = await request(app)
      .patch('/api/staff/some-id')
      .set('Authorization', `Bearer ${kasirToken()}`)
      .send({ name: 'x' });
    expect(res.status).toBe(403);
  });

  it('403 buat Pengepak', async () => {
    const res = await request(app)
      .patch('/api/staff/some-id')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`)
      .send({ name: 'x' });
    expect(res.status).toBe(403);
  });

  it('404 kalau staf gak ketemu', async () => {
    mockedRepo.updateUser.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/staff/gak-ada')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'x' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/staff/:id/deactivate -- Owner', () => {
  it('200 buat Owner, is_active jadi false', async () => {
    mockedRepo.findById.mockResolvedValue(buildUser({ role: 'kasir' }));
    mockedRepo.deactivateUser.mockResolvedValue(buildUser({ role: 'kasir', is_active: false }));

    const res = await request(app)
      .patch('/api/staff/some-id/deactivate')
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
  });

  it('403 buat Kasir', async () => {
    const res = await request(app)
      .patch('/api/staff/some-id/deactivate')
      .set('Authorization', `Bearer ${kasirToken()}`);
    expect(res.status).toBe(403);
  });

  it('403 buat Pengepak', async () => {
    const res = await request(app)
      .patch('/api/staff/some-id/deactivate')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`);
    expect(res.status).toBe(403);
  });

  it('404 kalau staf gak ketemu', async () => {
    mockedRepo.findById.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/staff/gak-ada/deactivate')
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(404);
  });

  it('400 kalau targetnya akun Owner -- gak boleh dinonaktifkan lewat sini (termasuk nonaktifin diri sendiri)', async () => {
    mockedRepo.findById.mockResolvedValue(buildUser({ id: 'owner-id', role: 'owner' }));

    const res = await request(app)
      .patch('/api/staff/owner-id/deactivate')
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedRepo.deactivateUser).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/staff/:id/activate -- Owner', () => {
  it('200 buat Owner, is_active jadi true lagi', async () => {
    mockedRepo.activateUser.mockResolvedValue(buildUser({ role: 'kasir', is_active: true }));

    const res = await request(app)
      .patch('/api/staff/some-id/activate')
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(true);
  });

  it('403 buat Kasir', async () => {
    const res = await request(app)
      .patch('/api/staff/some-id/activate')
      .set('Authorization', `Bearer ${kasirToken()}`);
    expect(res.status).toBe(403);
  });

  it('403 buat Pengepak', async () => {
    const res = await request(app)
      .patch('/api/staff/some-id/activate')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`);
    expect(res.status).toBe(403);
  });

  it('404 kalau staf gak ketemu', async () => {
    mockedRepo.activateUser.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/staff/gak-ada/activate')
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(404);
  });

  it('401 tanpa token', async () => {
    const res = await request(app).patch('/api/staff/some-id/activate');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/store-settings -- Owner', () => {
  it('200 buat Owner', async () => {
    mockedRepo.getStoreSettings.mockResolvedValue(buildStoreSettings());

    const res = await request(app).get('/api/store-settings').set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.business_name).toBe('Toko Saya');
  });

  it('403 buat Kasir', async () => {
    const res = await request(app).get('/api/store-settings').set('Authorization', `Bearer ${kasirToken()}`);
    expect(res.status).toBe(403);
  });

  it('403 buat Pengepak', async () => {
    const res = await request(app)
      .get('/api/store-settings')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`);
    expect(res.status).toBe(403);
  });

  it('401 tanpa token', async () => {
    const res = await request(app).get('/api/store-settings');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/store-settings -- Owner', () => {
  it('200 buat Owner', async () => {
    mockedRepo.getStoreSettings.mockResolvedValue(buildStoreSettings());
    mockedRepo.updateStoreSettings.mockResolvedValue(buildStoreSettings({ business_name: 'Toko Baru' }));

    const res = await request(app)
      .patch('/api/store-settings')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ business_name: 'Toko Baru' });

    expect(res.status).toBe(200);
    expect(res.body.business_name).toBe('Toko Baru');
  });

  it('403 buat Kasir', async () => {
    const res = await request(app)
      .patch('/api/store-settings')
      .set('Authorization', `Bearer ${kasirToken()}`)
      .send({ business_name: 'x' });
    expect(res.status).toBe(403);
  });

  it('403 buat Pengepak', async () => {
    const res = await request(app)
      .patch('/api/store-settings')
      .set('Authorization', `Bearer ${staffToken('pengepak')}`)
      .send({ business_name: 'x' });
    expect(res.status).toBe(403);
  });

  it('400 kalau business_name dikirim kosong', async () => {
    const res = await request(app)
      .patch('/api/store-settings')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ business_name: '' });

    expect(res.status).toBe(400);
  });
});
