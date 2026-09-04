// backend/src/modules/ecommerce-sync/repository.ts

// Semua fungsi di sini cuma "ngobrol" sama Prisma/database. service.ts
// tidak boleh import { prisma } langsung — semua akses data lewat fungsi
// yang disediakan di sini (pola sama seperti auth-product/repository.ts).

import { prisma } from '../../shared/db';
import { encrypt, decrypt } from './crypto.util';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------

export interface StoredToken {
  shopIdExternal: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// platform_name tidak unique di skema — ambil baris terbaru. Cukup untuk
// single-shop per platform (scope project ini: 1 bisnis, bukan multi-tenant).
export async function findPlatformRow(platformName: string) {
  return prisma.platforms.findFirst({
    where: { platform_name: platformName },
    orderBy: { updated_at: 'desc' },
  });
}

export async function listPlatformRows() {
  return prisma.platforms.findMany({ orderBy: { platform_name: 'asc' } });
}

export async function findPlatformById(id: string) {
  return prisma.platforms.findUnique({ where: { id } });
}

export async function getDecryptedToken(platformName: string): Promise<StoredToken | null> {
  const row = await findPlatformRow(platformName);
  if (!row?.access_token_encrypted || !row.refresh_token_encrypted || !row.token_expires_at || !row.shop_id_external) {
    return null;
  }
  return {
    shopIdExternal: row.shop_id_external,
    accessToken: decrypt(row.access_token_encrypted),
    refreshToken: decrypt(row.refresh_token_encrypted),
    expiresAt: row.token_expires_at,
  };
}

export async function upsertPlatformToken(platformName: string, token: StoredToken) {
  const existing = await findPlatformRow(platformName);
  const data = {
    platform_name: platformName,
    shop_id_external: token.shopIdExternal,
    access_token_encrypted: encrypt(token.accessToken),
    refresh_token_encrypted: encrypt(token.refreshToken),
    token_expires_at: token.expiresAt,
    is_connected: true,
  };
  if (existing) return prisma.platforms.update({ where: { id: existing.id }, data });
  return prisma.platforms.create({ data });
}

export async function disconnectPlatform(platformName: string) {
  const existing = await findPlatformRow(platformName);
  if (!existing) return null;
  return prisma.platforms.update({
    where: { id: existing.id },
    data: { is_connected: false, access_token_encrypted: null, refresh_token_encrypted: null, token_expires_at: null },
  });
}

export async function markSyncResult(platformName: string, status: 'success' | 'failed') {
  const existing = await findPlatformRow(platformName);
  if (!existing) return;
  await prisma.platforms.update({
    where: { id: existing.id },
    data: { last_synced_at: new Date(), last_sync_status: status },
  });
}

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------

export async function findCustomerByExternalUsername(platformName: string, username: string) {
  return prisma.customers.findFirst({ where: { external_username: username, source: platformName } });
}

export async function createCustomerFromMarketplace(platformName: string, username: string) {
  return prisma.customers.create({ data: { external_username: username, source: platformName } });
}

export async function searchCustomers(query: string) {
  return prisma.customers.findMany({
    where: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { phone: { contains: query } }] },
    take: 20,
  });
}

// CRM v2 (FR-OC-10) -- cuma field yang ada di schema Customer di
// contracts/api.yaml. `external_username`/`updated_at` sengaja tidak
// dipilih, itu detail internal marketplace-matching (Step 4), bukan
// bagian kontrak CRM.
const CUSTOMER_CRM_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  external_customer_ref: true,
  created_at: true,
} as const;

export async function listCustomers() {
  return prisma.customers.findMany({ select: CUSTOMER_CRM_SELECT, orderBy: { created_at: 'desc' } });
}

export async function findCustomerById(id: string) {
  return prisma.customers.findUnique({ where: { id }, select: CUSTOMER_CRM_SELECT });
}

export interface CustomerWriteInput {
  name?: string;
  phone?: string;
  email?: string;
}

export async function createCustomer(input: CustomerWriteInput) {
  return prisma.customers.create({ data: input, select: CUSTOMER_CRM_SELECT });
}

export async function updateCustomer(id: string, input: CustomerWriteInput) {
  return prisma.customers.update({ where: { id }, data: input, select: CUSTOMER_CRM_SELECT });
}

// ---------------------------------------------------------------------
// External orders
// ---------------------------------------------------------------------

export async function findExternalOrder(platformId: string, externalOrderId: string) {
  return prisma.external_orders.findUnique({
    where: { platform_id_external_order_id: { platform_id: platformId, external_order_id: externalOrderId } },
  });
}

export interface UpsertOrderInput {
  platformId: string;
  externalOrderId: string;
  customerId: string | null;
  status: string;
  slaType: string;
  slaDeadline: Date;
  receivedAt: Date;
  totalAmount?: number;
  paymentMethod?: string;
  rawPayload: unknown;
  items: {
    externalItemRef?: string;
    itemName: string;
    qty: number;
    unitPrice?: number;
  }[];
}

/** Upsert order + replace item baris (delete+recreate — lebih sederhana & aman daripada per-item upsert). */
export async function upsertExternalOrderRow(input: UpsertOrderInput) {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.external_orders.upsert({
        where: {
          platform_id_external_order_id: { platform_id: input.platformId, external_order_id: input.externalOrderId },
        },
        update: {
          status: input.status,
          total_amount: input.totalAmount,
          payment_method: input.paymentMethod,
          raw_payload: input.rawPayload as Prisma.InputJsonValue,
          customer_id: input.customerId,
        },
        create: {
          platform_id: input.platformId,
          external_order_id: input.externalOrderId,
          customer_id: input.customerId,
          status: input.status,
          sla_type: input.slaType,
          sla_deadline: input.slaDeadline,
          total_amount: input.totalAmount,
          payment_method: input.paymentMethod,
          raw_payload: input.rawPayload as Prisma.InputJsonValue,
          received_at: input.receivedAt,
        },
      });

      await tx.external_order_items.deleteMany({ where: { external_order_id: row.id } });
      if (input.items.length) {
        await tx.external_order_items.createMany({
          data: input.items.map((item) => ({
            external_order_id: row.id,
            external_item_ref: item.externalItemRef,
            item_name_snapshot: item.itemName,
            qty: item.qty,
            unit_price: item.unitPrice,
          })),
        });
      }

      return row;
    },
    { timeout: 15000 } // Supabase free-tier kadang lambat merespons di request pertama (cold start)
  );
}

export interface OrderListFilters {
  platformId?: string;
  status?: string;
  slaType?: string;
  page: number;
  limit: number;
}

export async function listExternalOrderRows(filters: OrderListFilters) {
  const where: Prisma.external_ordersWhereInput = {
    platform_id: filters.platformId,
    status: filters.status,
    sla_type: filters.slaType,
  };

  return prisma.external_orders.findMany({
    where,
    select: {
      id: true,
      platform_id: true,
      external_order_id: true,
      customer_id: true,
      status: true,
      sla_type: true,
      sla_deadline: true,
      total_amount: true,
      received_at: true,
    },
    orderBy: { sla_deadline: 'asc' },
    skip: (filters.page - 1) * filters.limit,
    take: filters.limit,
  });
}

// raw_payload cuma diambil di detail (SRS 10.5) — list di atas sengaja tidak select itu.
export async function getExternalOrderDetailRow(id: string) {
  return prisma.external_orders.findUnique({
    where: { id },
    include: {
      external_order_items: true,
      order_shipping_address: true,
    },
  });
}

export async function updateExternalOrderStatusRow(id: string, status: string) {
  return prisma.external_orders.update({ where: { id }, data: { status } });
}

// ---------------------------------------------------------------------
// SLA Escalation (FR-OC-09) -- "order mendekati deadline SLA namun belum
// ada ticket". Threshold ("mendekati" = berapa menit) TIDAK ada di
// SRS/contracts/api.yaml/schema -- WAJIB dikirim si pemanggil (service.ts),
// tidak di-hardcode di sini. Lihat laporan audit soal ambiguity ini.
// ---------------------------------------------------------------------

/** Label `notifications.type` untuk alert eskalasi ini. Belum ada konvensi
 *  resmi di repo untuk nama tipe ini -- dipilih di sini, bukan dari source
 *  of truth. Sepakati ulang bareng tim kalau ada nama lain yang diinginkan. */
export const SLA_ESCALATION_NOTIFICATION_TYPE = 'sla_escalation';

export interface EscalationCandidate {
  id: string;
  platform_id: string;
  external_order_id: string;
  sla_type: string;
  sla_deadline: Date | null;
}

/**
 * Order yang deadline SLA-nya ada di antara `now` dan `now + windowMs`
 * (BELUM lewat -- FR-OC-09 minta "mendekati", bukan "sudah lewat"), dan
 * belum punya ticket sama sekali (relasi `tickets` kosong -- FR-OC-09).
 */
export async function findOrdersNeedingEscalation(now: Date, windowMs: number): Promise<EscalationCandidate[]> {
  return prisma.external_orders.findMany({
    where: {
      sla_deadline: { not: null, gte: now, lte: new Date(now.getTime() + windowMs) },
      tickets: { none: {} },
    },
    select: { id: true, platform_id: true, external_order_id: true, sla_type: true, sla_deadline: true },
    orderBy: { sla_deadline: 'asc' },
  });
}

/** Sudah pernah dibuatkan notifikasi eskalasi untuk order ini? (dedup --
 *  cek ke tabel notifications langsung, bukan state in-memory, supaya
 *  benar walau pengecekan ini dijalankan ulang lintas proses/restart). */
export async function hasEscalationNotification(externalOrderId: string): Promise<boolean> {
  const existing = await prisma.notifications.findFirst({
    where: {
      type: SLA_ESCALATION_NOTIFICATION_TYPE,
      reference_type: 'external_order',
      reference_id: externalOrderId,
    },
    select: { id: true },
  });
  return existing !== null;
}
