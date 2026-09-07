// backend/test/ticket-handover-stock.test.ts

// TASK 9B — Marketplace Stock Deduction on Ticket Handover.
// Lihat laporan audit Task 9A "Stock Deduction Architecture Audit" untuk
// desain lengkap. Pola test & mocking di file ini SAMA seperti
// test/tickets.test.ts (auth-product/repository di-mock total,
// sales-inventory & ecommerce-sync repository TIDAK di-mock -- real
// Docker Postgres) dan test/product-mapping.test.ts (real HTTP lewat
// supertest, bukan panggil service/repository langsung, supaya jalur
// yang dites PERSIS sama seperti yang dipakai aplikasi asli).

import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { app } from '../src/app';
import { prisma } from '../src/shared/db';
import * as authRepo from '../src/modules/auth-product/repository';
import type { User } from '../src/modules/auth-product/repository';
import { ownerToken } from './helpers/auth';
import { bikinExternalOrder, pinjamAkun, siapkanKolamAkun } from './helpers/fixtures';

jest.mock('../src/modules/auth-product/repository');

const mockedAuthRepo = authRepo as jest.Mocked<typeof authRepo>;

beforeAll(async () => {
  await siapkanKolamAkun();
});

afterEach(() => {
  jest.resetAllMocks();
});

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: pinjamAkun(),
    name: 'Pengepak Uji',
    email_or_username: 'pengepak',
    password_hash: '$2a$10$tidakDipakaiLangsungDiTest.................',
    role: 'pengepak',
    phone: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockUsers(...users: User[]): void {
  mockedAuthRepo.findById.mockImplementation(async (id: string) => users.find((u) => u.id === id) ?? null);
}

async function seedProduct(stockQty: number): Promise<string> {
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ name: `TEST-PRODUCT-${randomUUID()}`, price: 10000, stock_qty: stockQty });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function stockOf(productId: string): Promise<number> {
  const res = await request(app).get(`/api/products/${productId}`).set('Authorization', `Bearer ${ownerToken()}`);
  return res.body.stock_qty as number;
}

interface TicketItemBody {
  id: string;
  product_id: string;
  qty: number;
  is_packed: boolean;
}

async function createTicketFor(items: { productId: string; qty: number }[]): Promise<{
  id: string;
  status: string;
  items: TicketItemBody[];
  pengepak: User;
}> {
  const pengepak = buildUser();
  mockUsers(pengepak);
  const orderId = await bikinExternalOrder();

  const res = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({
      external_order_id: orderId,
      assigned_to_user_id: pengepak.id,
      items: items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    });
  expect(res.status).toBe(201);
  return { id: res.body.id, status: res.body.status, items: res.body.items, pengepak };
}

function ubahStatus(ticketId: string, body: Record<string, unknown>) {
  return request(app).patch(`/api/tickets/${ticketId}/status`).set('Authorization', `Bearer ${ownerToken()}`).send(body);
}

/** Centang semua item ticket (tanpa ganti status) -- langkah pengepak sebelum handover. */
function packAllItems(ticket: { id: string; items: TicketItemBody[] }) {
  return ubahStatus(ticket.id, { ticket_items: ticket.items.map((i) => ({ id: i.id, is_packed: true })) });
}

function handOver(ticketId: string) {
  return ubahStatus(ticketId, { status: 'handed_over' });
}

async function ledgerRowsFor(ticketId: string, productId: string) {
  return prisma.stock_adjustments.findMany({
    where: { reference_type: 'external_order', reference_id: ticketId, product_id: productId },
  });
}

describe('Stock deduction saat Ticket Handed Over (Task 9B)', () => {
  it('Test 1 -- basic deduction: stock 10, ticket qty 3, handed_over -> stock jadi 7', async () => {
    const productId = await seedProduct(10);
    const ticket = await createTicketFor([{ productId, qty: 3 }]);

    await packAllItems(ticket);
    const res = await handOver(ticket.id);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('handed_over');
    expect(await stockOf(productId)).toBe(7);
  });

  it('Test 2 -- ledger stock_adjustments tercatat benar (reason, reference, before/after, change_qty)', async () => {
    const productId = await seedProduct(10);
    const ticket = await createTicketFor([{ productId, qty: 3 }]);

    await packAllItems(ticket);
    await handOver(ticket.id);

    const rows = await ledgerRowsFor(ticket.id, productId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      product_id: productId,
      change_qty: -3,
      reason: 'external_order',
      reference_type: 'external_order',
      reference_id: ticket.id,
      stock_before: 10,
      stock_after: 7,
    });
  });

  it('Test 3 -- retry: handover kedua kali -> 409, stock cuma terpotong sekali, ledger cuma 1 baris', async () => {
    const productId = await seedProduct(10);
    const ticket = await createTicketFor([{ productId, qty: 3 }]);
    await packAllItems(ticket);

    const pertama = await handOver(ticket.id);
    expect(pertama.status).toBe(200);

    const kedua = await handOver(ticket.id);
    expect(kedua.status).toBe(409);

    expect(await stockOf(productId)).toBe(7);
    expect(await ledgerRowsFor(ticket.id, productId)).toHaveLength(1);
  });

  it('Test 4 -- dua request handover bersamaan -> SATU 200, SATU 409, stock cuma terpotong sekali', async () => {
    const productId = await seedProduct(10);
    const ticket = await createTicketFor([{ productId, qty: 3 }]);
    await packAllItems(ticket);

    const [a, b] = await Promise.all([handOver(ticket.id), handOver(ticket.id)]);
    const statuses = [a.status, b.status].sort();

    expect(statuses).toEqual([200, 409]);
    expect(await stockOf(productId)).toBe(7);
    expect(await ledgerRowsFor(ticket.id, productId)).toHaveLength(1);
  });

  it('Test 5 -- stok tidak cukup (stock 2, qty 5) -> 409, stock tetap, ticket TIDAK handed_over, tidak ada ledger', async () => {
    const productId = await seedProduct(2);
    const ticket = await createTicketFor([{ productId, qty: 5 }]);
    await packAllItems(ticket);

    const res = await handOver(ticket.id);

    expect(res.status).toBe(409);
    expect(await stockOf(productId)).toBe(2);
    expect(await ledgerRowsFor(ticket.id, productId)).toHaveLength(0);

    const cek = await request(app).get(`/api/tickets`).query({ limit: 100 }).set('Authorization', `Bearer ${ownerToken()}`);
    const masih = cek.body.find((t: { id: string }) => t.id === ticket.id);
    expect(masih.status).not.toBe('handed_over');
  });

  it('Test 6 -- multi-product, salah satu stok kurang -> ALL ROLLBACK (bukan salah satu kepotong)', async () => {
    const productA = await seedProduct(10); // qty 3, stok cukup
    const productB = await seedProduct(2); // qty 5, stok TIDAK cukup
    const ticket = await createTicketFor([
      { productId: productA, qty: 3 },
      { productId: productB, qty: 5 },
    ]);
    await packAllItems(ticket);

    const res = await handOver(ticket.id);

    expect(res.status).toBe(409);
    expect(await stockOf(productA)).toBe(10); // TIDAK kepotong walau stoknya sendiri cukup
    expect(await stockOf(productB)).toBe(2);
    expect(await ledgerRowsFor(ticket.id, productA)).toHaveLength(0);
    expect(await ledgerRowsFor(ticket.id, productB)).toHaveLength(0);

    const cek = await request(app).get(`/api/tickets`).query({ limit: 100 }).set('Authorization', `Bearer ${ownerToken()}`);
    const masih = cek.body.find((t: { id: string }) => t.id === ticket.id);
    expect(masih.status).not.toBe('handed_over');
  });

  it('non-handover transitions (assigned -> packing -> packed) TIDAK menyentuh stock sama sekali', async () => {
    const productId = await seedProduct(10);
    const ticket = await createTicketFor([{ productId, qty: 3 }]);

    await ubahStatus(ticket.id, { status: 'packing' });
    await ubahStatus(ticket.id, { status: 'packed' });
    await packAllItems(ticket);

    expect(await stockOf(productId)).toBe(10);
    expect(await ledgerRowsFor(ticket.id, productId)).toHaveLength(0);
  });
});
