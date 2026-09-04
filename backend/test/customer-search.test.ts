// backend/test/customer-search.test.ts

// TASK #13 — Customer Search, level HTTP (modul ecommerce-sync / Order Hub).
//
// GET /api/customers/search lewat `app` asli (supertest) -- membuktikan
// routes.ts -> service.ts -> repository.ts benar-benar tersambung, validasi
// `q`, dan RBAC (owner/kasir boleh, pengepak ditolak). repository.ts
// di-mock total (jest.mock) -- pola sama seperti platform-connection.test.ts
// -- supaya cepat & tidak butuh koneksi Supabase.
//
// Query Prisma ASLI (apakah `contains` + `mode: 'insensitive'` yang
// sungguhan dikirim ke DB) diuji TERPISAH di customer-search-repository.test.ts,
// karena file itu butuh repository.ts yang TIDAK di-mock -- tidak bisa
// digabung ke file ini (jest.mock ke modul yang sama tidak bisa
// "dinyalakan-matikan" per describe block dalam satu file).

import { describe, expect, it, jest, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app';
import * as repo from '../src/modules/ecommerce-sync/repository';
import { ownerToken, kasirToken, tokenFor } from './helpers/auth';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.clearAllMocks();
});

type CustomerRow = Awaited<ReturnType<typeof repo.searchCustomers>>[number];

function buildCustomerRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: 'customer-uuid-1',
    name: 'Rina Amelia',
    phone: '081234567890',
    email: null,
    source: 'walk_in',
    external_customer_ref: null,
    external_username: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as CustomerRow;
}

describe('GET /api/customers/search — HTTP (repository.ts di-mock)', () => {
  it('A. q kosong -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/customers/search')
      .query({ q: '' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedRepo.searchCustomers).not.toHaveBeenCalled();
  });

  it('B. q hanya whitespace -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/customers/search')
      .query({ q: '  ' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedRepo.searchCustomers).not.toHaveBeenCalled();
  });

  it('C. q cocok nama customer -> 200, hasil mengandung customer tersebut', async () => {
    const rina = buildCustomerRow({ id: 'customer-uuid-1', name: 'Rina Amelia', phone: '081234567890' });
    mockedRepo.searchCustomers.mockResolvedValue([rina]);

    const res = await request(app)
      .get('/api/customers/search')
      .query({ q: 'Rina' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(mockedRepo.searchCustomers).toHaveBeenCalledWith('Rina');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: 'customer-uuid-1', name: 'Rina Amelia' });
  });

  it('D. q cocok nomor telepon -> 200, hasil mengandung customer tersebut', async () => {
    const budi = buildCustomerRow({ id: 'customer-uuid-2', name: 'Budi Santoso', phone: '089988887777' });
    mockedRepo.searchCustomers.mockResolvedValue([budi]);

    const res = await request(app)
      .get('/api/customers/search')
      .query({ q: '089988887777' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(mockedRepo.searchCustomers).toHaveBeenCalledWith('089988887777');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: 'customer-uuid-2', phone: '089988887777' });
  });

  it('F. RBAC owner -> 200 (boleh akses)', async () => {
    mockedRepo.searchCustomers.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers/search')
      .query({ q: 'apa saja' })
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
  });

  it('G. RBAC kasir -> 200 (boleh akses)', async () => {
    mockedRepo.searchCustomers.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/customers/search')
      .query({ q: 'apa saja' })
      .set('Authorization', `Bearer ${kasirToken()}`);

    expect(res.status).toBe(200);
  });

  it('H. RBAC pengepak -> 403 FORBIDDEN (ditolak requireRole)', async () => {
    const res = await request(app)
      .get('/api/customers/search')
      .query({ q: 'apa saja' })
      .set('Authorization', `Bearer ${tokenFor('pengepak')}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockedRepo.searchCustomers).not.toHaveBeenCalled();
  });
});
