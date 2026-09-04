// backend/test/customer-search-repository.test.ts

// TASK #13 — Customer Search (E): case-insensitive query, level repository.
//
// Menguji repo.searchCustomers() ASLI (bukan dengan mock repository.ts
// sendiri, tapi mock 1 layer di bawahnya: `prisma`, shared/db.ts) --
// pola SAMA PERSIS dengan customer-matching.test.ts. Fungsi repository.ts
// yang diuji jalan APA ADANYA (real code, real query object yang dikirim
// ke Prisma) -- kalau repository.ts suatu saat kehilangan
// `mode: 'insensitive'` di where clause `name`, fake findMany di bawah ini
// menegakkan perbandingan case-SENSITIVE, jadi test ini akan gagal --
// bukan cuma menguji bahwa mock mengembalikan apa yang disuruh.
//
// Kenapa bukan real DB: sama alasan seperti customer-matching.test.ts --
// project ini belum punya test infrastructure DB beneran yang jalan.

import { describe, expect, it, afterEach, jest } from '@jest/globals';

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

const FIXTURES: FakeCustomerRow[] = [
  {
    id: 'customer-uuid-rina',
    name: 'Rina Amelia',
    phone: '081234567890',
    email: null,
    external_customer_ref: null,
    external_username: null,
    source: 'walk_in',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 'customer-uuid-budi',
    name: 'budi santoso',
    phone: '089988887777',
    email: null,
    external_customer_ref: null,
    external_username: null,
    source: 'walk_in',
    created_at: new Date(),
    updated_at: new Date(),
  },
];

jest.mock('../src/shared/db', () => ({
  prisma: {
    customers: {
      // Meniru `prisma.customers.findMany({ where: { OR: [...] } })` --
      // `name.contains` HANYA dibandingkan case-insensitive kalau
      // `mode: 'insensitive'` sungguhan ada di query object yang dikirim
      // repository.ts (persis semantik Prisma asli), `phone.contains`
      // selalu case-sensitive substring (wajar, nomor telepon numerik).
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            OR: [{ name: { contains: string; mode?: string } }, { phone: { contains: string } }];
          };
        }) => {
          const [{ name: nameClause }, { phone: phoneClause }] = where.OR;
          return FIXTURES.filter((row) => {
            const nameMatch =
              nameClause.mode === 'insensitive'
                ? (row.name ?? '').toLowerCase().includes(nameClause.contains.toLowerCase())
                : (row.name ?? '').includes(nameClause.contains);
            const phoneMatch = (row.phone ?? '').includes(phoneClause.contains);
            return nameMatch || phoneMatch;
          });
        }
      ),
    },
  },
}));

// Import SETELAH jest.mock('../src/shared/db') di atas, supaya repository.ts
// yang di-load memakai `prisma` versi fake ini.
import * as repo from '../src/modules/ecommerce-sync/repository';

afterEach(() => {
  jest.clearAllMocks();
});

describe('repo.searchCustomers — case-insensitive pada kolom name (query Prisma asli, tidak di-mock)', () => {
  it('query huruf besar semua -> tetap menemukan nama yang disimpan huruf kecil ("budi santoso")', async () => {
    const result = await repo.searchCustomers('BUDI');

    expect(result.map((r) => r.id)).toContain('customer-uuid-budi');
  });

  it('query huruf kecil semua -> tetap menemukan nama yang disimpan Title Case ("Rina Amelia")', async () => {
    const result = await repo.searchCustomers('rina');

    expect(result.map((r) => r.id)).toContain('customer-uuid-rina');
  });

  it('query campuran kapitalisasi -> tetap match', async () => {
    const result = await repo.searchCustomers('rInA aMeLiA');

    expect(result.map((r) => r.id)).toContain('customer-uuid-rina');
  });

  it('query tidak cocok nama maupun telepon -> array kosong', async () => {
    const result = await repo.searchCustomers('nama-yang-tidak-ada-sama-sekali');

    expect(result).toEqual([]);
  });
});
