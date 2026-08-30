import { prisma } from "../../db/prisma.client";

// FR-OC-08 (data dasar) — dipakai saat checkout Kasir (FR-OC-... /api/customers/search).
// CRUD/analitik lengkap (FR-OC-10) itu v2, di luar scope endpoint ini.
export async function searchCustomers(query: string) {
  const q = query.trim();
  if (!q) return [];

  return prisma.customers.findMany({
    where: {
      OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
    },
    take: 20,
  });
}
