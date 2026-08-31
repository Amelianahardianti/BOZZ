// backend/test/categories.test.ts

// Menguji endpoint GET & POST /api/categories sesuai contracts/api.yaml.

import request from 'supertest';
import { app } from '../src/app';
import * as authService from '../src/modules/auth-product/service';

async function loginAs(username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

/** Bikin akun kasir sekali saja, dipakai buat nguji pembatasan role. */
async function kasirToken(): Promise<string> {
  const ownerToken = await loginAs('owner', 'owner123');
  expect(ownerToken).toBeTruthy();
  await authService
    .createStaff({
      name: 'Kasir Uji',
      username: 'kasir-kategori',
      password: 'kasir123',
      role: 'kasir',
      createdByUserId: 'seed-owner-1',
    })
    .catch(() => undefined); // sudah ada dari test sebelumnya -- tidak apa-apa
  return loginAs('kasir-kategori', 'kasir123');
}

describe('GET /api/categories', () => {
  it('menolak request tanpa token', async () => {
    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('membalas array kategori terurut A-Z untuk user yang sudah login', async () => {
    const token = await kasirToken();

    const res = await request(app).get('/api/categories').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(Object.keys(res.body[0]).sort()).toEqual(['created_at', 'created_by', 'id', 'name']);

    const names = res.body.map((c: { name: string }) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'id')));
  });
});

describe('POST /api/categories', () => {
  it('membuat kategori baru dan mencatat pembuatnya', async () => {
    const token = await loginAs('owner', 'owner123');

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '  Snack   Kering  ' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Snack Kering'); // spasi berlebih dirapikan
    expect(res.body.created_by).toBe('seed-owner-1');
    expect(res.body.id).toBeTruthy();

    // kategori baru ikut muncul di daftar
    const list = await request(app).get('/api/categories').set('Authorization', `Bearer ${token}`);
    expect(list.body.map((c: { name: string }) => c.name)).toContain('Snack Kering');
  });

  it('menolak nama yang sudah dipakai, walau beda huruf besar/kecil', async () => {
    const token = await loginAs('owner', 'owner123');

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'mInUmAn' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('menolak nama kosong / cuma spasi', async () => {
    const token = await loginAs('owner', 'owner123');

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('melarang role selain owner menambah kategori', async () => {
    const token = await kasirToken();

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Kategori Dari Kasir' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
