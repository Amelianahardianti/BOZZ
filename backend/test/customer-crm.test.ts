// backend/test/customer-crm.test.ts

// TASK #15 — Full Customer CRM API (v2, FR-OC-10) (modul ecommerce-sync /
// Order Hub & Customer).
//
// GET/POST /api/customers, GET/PATCH /api/customers/:id lewat `app` asli
// (supertest) -- pola sama dengan orders.test.ts (repository.ts di-mock).
//
// CATATAN PENTING soal scope: contracts/api.yaml (summary endpoint detail)
// dan FR-OC-10 menyebut "riwayat transaksi", "analitik", "segmentasi" --
// TIDAK ADA field/rumus untuk itu di schema `Customer` manapun di
// contracts/api.yaml maupun schema.prisma. Production code (service.ts)
// SENGAJA tidak mengembalikan field itu (lihat komentar di sana) --
// test ini karena itu HANYA menguji field yang benar-benar ada di schema
// Customer (id, name, phone, email, source, external_customer_ref,
// created_at), bukan riwayat/analitik/segmentasi yang tidak ada source of
// truth-nya.
//
// CustomerCreateRequest di kontrak TIDAK menandai field apa pun sebagai
// required -- jadi "invalid payload" di sini berarti TYPE MISMATCH (mis.
// name dikirim sebagai number), bukan field kosong.

import { describe, expect, it, jest, afterEach } from '@jest/globals';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import * as repo from '../src/modules/ecommerce-sync/repository';
import { ownerToken, kasirToken, tokenFor } from './helpers/auth';

jest.mock('../src/modules/ecommerce-sync/repository');

const mockedRepo = repo as jest.Mocked<typeof repo>;

afterEach(() => {
  jest.clearAllMocks();
});

type CustomerRow = Awaited<ReturnType<typeof repo.listCustomers>>[number];

function buildCustomerRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: randomUUID(),
    name: 'Rina Amelia',
    phone: '081234567890',
    email: null,
    source: 'walk_in',
    external_customer_ref: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as CustomerRow;
}

describe('GET /api/customers', () => {
  it('A. owner -> 200, response sesuai schema Customer', async () => {
    const rows = [buildCustomerRow({ id: 'cust-1' }), buildCustomerRow({ id: 'cust-2', name: 'Budi Santoso' })];
    mockedRepo.listCustomers.mockResolvedValue(rows);

    const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ id: 'cust-1', name: 'Rina Amelia' });
    expect(Object.keys(res.body[0]).sort()).toEqual(
      ['created_at', 'email', 'external_customer_ref', 'id', 'name', 'phone', 'source'].sort()
    );
  });

  it('A2. dataset kosong -> 200 + array kosong (bukan error)', async () => {
    mockedRepo.listCustomers.mockResolvedValue([]);

    const res = await request(app).get('/api/customers').set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/customers/:id', () => {
  it('B. owner -> 200, detail customer benar', async () => {
    const customer = buildCustomerRow({ id: 'cust-detail-1', name: 'Fajar Nugroho', phone: '089988887777' });
    mockedRepo.findCustomerById.mockResolvedValue(customer);

    const res = await request(app)
      .get('/api/customers/cust-detail-1')
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(200);
    expect(mockedRepo.findCustomerById).toHaveBeenCalledWith('cust-detail-1');
    expect(res.body).toMatchObject({ id: 'cust-detail-1', name: 'Fajar Nugroho', phone: '089988887777' });
  });

  it('B2. customer tidak ditemukan -> 404 NOT_FOUND', async () => {
    mockedRepo.findCustomerById.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/customers/${randomUUID()}`)
      .set('Authorization', `Bearer ${ownerToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/customers', () => {
  it('C. owner + payload valid -> 201, customer dibuat', async () => {
    const created = buildCustomerRow({ id: 'cust-new-1', name: 'Dewi Lestari', phone: '081211112222' });
    mockedRepo.createCustomer.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Dewi Lestari', phone: '081211112222' });

    expect(res.status).toBe(201);
    expect(mockedRepo.createCustomer).toHaveBeenCalledWith({ name: 'Dewi Lestari', phone: '081211112222' });
    expect(res.body).toMatchObject({ id: 'cust-new-1', name: 'Dewi Lestari' });
  });

  it('C2. payload kosong -> 201 (kontrak tidak mewajibkan field apa pun)', async () => {
    mockedRepo.createCustomer.mockResolvedValue(buildCustomerRow({ id: 'cust-new-2', name: null, phone: null }));

    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({});

    expect(res.status).toBe(201);
    expect(mockedRepo.createCustomer).toHaveBeenCalledWith({});
  });

  it('invalid payload (name berupa number, bukan string) -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 12345 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedRepo.createCustomer).not.toHaveBeenCalled();
  });

  it('duplicate phone -> TIDAK ada constraint unik di schema customers, jadi dua create dengan phone sama SAMA-SAMA berhasil (bukan 409)', async () => {
    mockedRepo.createCustomer
      .mockResolvedValueOnce(buildCustomerRow({ id: 'cust-dup-1', phone: '081200002222' }))
      .mockResolvedValueOnce(buildCustomerRow({ id: 'cust-dup-2', phone: '081200002222' }));

    const first = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ phone: '081200002222' });
    const second = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ phone: '081200002222' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
  });
});

describe('PATCH /api/customers/:id', () => {
  it('D. owner + payload valid -> 200, customer terupdate', async () => {
    mockedRepo.findCustomerById.mockResolvedValue(buildCustomerRow({ id: 'cust-upd-1' }));
    mockedRepo.updateCustomer.mockResolvedValue(buildCustomerRow({ id: 'cust-upd-1', name: 'Rina A. (updated)' }));

    const res = await request(app)
      .patch('/api/customers/cust-upd-1')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Rina A. (updated)' });

    expect(res.status).toBe(200);
    expect(mockedRepo.updateCustomer).toHaveBeenCalledWith('cust-upd-1', { name: 'Rina A. (updated)' });
    expect(res.body).toMatchObject({ name: 'Rina A. (updated)' });
  });

  it('invalid payload (email berupa number) -> 400 VALIDATION_ERROR', async () => {
    mockedRepo.findCustomerById.mockResolvedValue(buildCustomerRow({ id: 'cust-upd-2' }));

    const res = await request(app)
      .patch('/api/customers/cust-upd-2')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ email: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedRepo.updateCustomer).not.toHaveBeenCalled();
  });

  it('customer tidak ditemukan -> 404 NOT_FOUND, update TIDAK dijalankan', async () => {
    mockedRepo.findCustomerById.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/customers/${randomUUID()}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Siapa Saja' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(mockedRepo.updateCustomer).not.toHaveBeenCalled();
  });
});

describe('RBAC — GET/POST /api/customers, GET/PATCH /api/customers/:id (owner-only)', () => {
  const endpoints: Array<[string, (token?: string) => request.Test]> = [
    [
      'GET /customers',
      (t) => {
        const req = request(app).get('/api/customers');
        return t ? req.set('Authorization', `Bearer ${t}`) : req;
      },
    ],
    [
      'POST /customers',
      (t) => {
        const req = request(app).post('/api/customers');
        return (t ? req.set('Authorization', `Bearer ${t}`) : req).send({});
      },
    ],
    [
      'GET /customers/:id',
      (t) => {
        const req = request(app).get(`/api/customers/${randomUUID()}`);
        return t ? req.set('Authorization', `Bearer ${t}`) : req;
      },
    ],
    [
      'PATCH /customers/:id',
      (t) => {
        const req = request(app).patch(`/api/customers/${randomUUID()}`);
        return (t ? req.set('Authorization', `Bearer ${t}`) : req).send({});
      },
    ],
  ];

  it.each(endpoints)('E. %s — kasir -> 403 FORBIDDEN', async (_label, makeRequest) => {
    const res = await makeRequest(kasirToken());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it.each(endpoints)('E. %s — pengepak -> 403 FORBIDDEN', async (_label, makeRequest) => {
    const res = await makeRequest(tokenFor('pengepak'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it.each(endpoints)('E. %s — tanpa token -> 401 UNAUTHORIZED', async (_label, makeRequest) => {
    const res = await makeRequest();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
