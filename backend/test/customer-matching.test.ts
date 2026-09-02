// backend/test/customer-matching.test.ts

// TEST #4 — Customer Matching (modul ecommerce-sync / Order Hub & Customer).
//
// Menguji findCustomerByExternalUsername() dan createCustomerFromMarketplace()
// di repository.ts (FR-OC-04, SRS 9.3) -- BUKAN dengan mock kedua fungsi itu
// sendiri, tapi dengan mock satu lapis di bawahnya: `prisma` (shared/db.ts).
// Fungsi repository.ts yang diuji jalan APA ADANYA (real code, real query
// object yang dikirim ke Prisma), cuma persistence-nya diganti in-memory
// fake yang meniru semantik findFirst/create Prisma (filter AND per field).
//
// Kenapa bukan real DB: project ini belum punya test infrastructure DB
// beneran yang jalan (grep ke seluruh backend/test -- tidak ada satu pun
// test yang pakai @testcontainers/postgresql walau ada di devDependencies,
// semua test lain full-mock repository). Bikin infrastructure testcontainers
// baru cuma buat 1 file test itu "infrastructure berlebihan" -- di luar
// scope task ini. Kalau repository.ts salah nulis field di `where`/`data`
// (mis. lupa `source`, salah nama field), test ini TETAP akan gagal --
// karena argumen yang di-assert datang dari kode repository.ts asli, bukan
// dari fake-nya.

import * as repo from '../src/modules/ecommerce-sync/repository';
import { describe, expect, it, jest, afterEach } from '@jest/globals';

interface FakeCustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  external_customer_ref: string | null;
  external_username: string | null;
  source: string;
  created_at: Date;
  updated_at: Date;
}

jest.mock('../src/shared/db', () => {
  const store: FakeCustomerRow[] = [];
  let idCounter = 1;

  return {
    prisma: {
      customers: {
        // Meniru `prisma.customers.findFirst({ where: { external_username, source } })`
        // -- AND di kedua field, persis semantik Prisma asli.
        findFirst: jest.fn(
          async ({ where }: { where: { external_username?: string; source?: string } }) => {
            return (
              store.find(
                (row) =>
                  row.external_username === where.external_username && row.source === where.source
              ) ?? null
            );
          }
        ),
        // Meniru `prisma.customers.create({ data })` -- benar-benar
        // menyimpan ke "tabel" in-memory, supaya findFirst sesudahnya bisa
        // menemukannya (bukan sekadar mengembalikan objek statis).
        create: jest.fn(async ({ data }: { data: { external_username?: string; source?: string } }) => {
          const row: FakeCustomerRow = {
            id: `customer-uuid-${idCounter++}`,
            name: null,
            phone: null,
            email: null,
            external_customer_ref: null,
            external_username: data.external_username ?? null,
            source: data.source ?? 'walk_in',
            created_at: new Date(),
            updated_at: new Date(),
          };
          store.push(row);
          return row;
        }),
      },
    },
  };
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('findCustomerByExternalUsername', () => {
  it('external_username + source sama -> menemukan customer existing', async () => {
    await repo.createCustomerFromMarketplace('tiktok', 'johnd');

    const found = await repo.findCustomerByExternalUsername('tiktok', 'johnd');

    expect(found).not.toBeNull();
    expect(found?.external_username).toBe('johnd');
    expect(found?.source).toBe('tiktok');
  });

  it('username sama tapi source berbeda -> tidak match', async () => {
    await repo.createCustomerFromMarketplace('tiktok', 'johnd');

    const found = await repo.findCustomerByExternalUsername('shopee', 'johnd');

    expect(found).toBeNull();
  });

  it('username berbeda -> tidak match', async () => {
    await repo.createCustomerFromMarketplace('tiktok', 'johnd');

    const found = await repo.findCustomerByExternalUsername('tiktok', 'janed');

    expect(found).toBeNull();
  });
});

describe('createCustomerFromMarketplace', () => {
  it('benar-benar membuat customer dengan external_username dan source yang diberikan', async () => {
    const created = await repo.createCustomerFromMarketplace('fakestore', 'buyer99');

    expect(created.external_username).toBe('buyer99');
    expect(created.source).toBe('fakestore');
    expect(created.id).toBeTruthy();

    // Bukan sekadar objek yang di-return -- benar-benar tersimpan, terbukti
    // bisa ditemukan lagi lewat findCustomerByExternalUsername.
    const found = await repo.findCustomerByExternalUsername('fakestore', 'buyer99');
    expect(found?.id).toBe(created.id);
  });
});
