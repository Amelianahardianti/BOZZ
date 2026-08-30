import { prisma } from "../../db/prisma.client";
import { eventBus } from "../../shared/event-bus";
import { classifySla, computeSlaDeadline } from "../../shared/sla.util";
import type { NormalizedOrder } from "../platforms/platform-adapter.types";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

export class OrderNotFoundError extends Error {}

async function findOrCreateCustomer(platformName: string, buyerUsername?: string) {
  if (!buyerUsername) return null;
  const existing = await prisma.customers.findFirst({
    where: { external_username: buyerUsername, source: platformName },
  });
  if (existing) return existing;
  return prisma.customers.create({
    data: { external_username: buyerUsername, source: platformName },
  });
}

/**
 * Upserts one normalized order (+ items) from a platform adapter, matched/deduped by
 * (platform_id, external_order_id) — the idempotency mechanism required by SRS 9.3.
 * Items are replaced (delete + recreate) on every call, same reasoning as the old
 * Shopee-only upsert: simpler and safer than per-item upsert for this stage.
 */
export async function upsertExternalOrder(platformId: string, platformName: string, order: NormalizedOrder) {
  const customer = await findOrCreateCustomer(platformName, order.buyerUsername);
  const existing = await prisma.external_orders.findUnique({
    where: { platform_id_external_order_id: { platform_id: platformId, external_order_id: order.externalOrderId } },
  });

  const receivedAt = existing?.received_at ?? new Date();
  const slaType = existing?.sla_type ?? classifySla(order.shippingCarrier);
  const slaDeadline = existing?.sla_deadline ?? computeSlaDeadline(receivedAt, slaType as any);

  const saved = await prisma.$transaction(
    async (tx) => {
      const row = await tx.external_orders.upsert({
        where: { platform_id_external_order_id: { platform_id: platformId, external_order_id: order.externalOrderId } },
        update: {
          status: order.status,
          external_status_raw: order.externalStatusRaw,
          total_amount: order.totalAmount,
          payment_method: order.paymentMethod,
          currency: order.currency ?? "IDR",
          is_cod: order.isCod ?? false,
          raw_payload: order.rawPayload as Prisma.InputJsonValue,
          customer_id: customer?.id,
        },
        create: {
          platform_id: platformId,
          external_order_id: order.externalOrderId,
          customer_id: customer?.id,
          status: order.status,
          sla_type: slaType,
          sla_deadline: slaDeadline,
          total_amount: order.totalAmount,
          payment_method: order.paymentMethod,
          currency: order.currency ?? "IDR",
          is_cod: order.isCod ?? false,
          external_status_raw: order.externalStatusRaw,
          raw_payload: order.rawPayload as Prisma.InputJsonValue,
          received_at: receivedAt,
        },
      });

      await tx.external_order_items.deleteMany({ where: { external_order_id: row.id } });
      if (order.items.length) {
        await tx.external_order_items.createMany({
          data: order.items.map((item) => ({
            external_order_id: row.id,
            external_item_ref: item.externalItemRef,
            item_name_snapshot: item.itemName,
            qty: item.qty,
            unit_price: item.unitPrice,
            model_id: item.modelId,
            model_sku: item.modelSku,
            model_name: item.modelName,
            order_item_id: item.orderItemId,
          })),
        });
      }

      return row;
    },
    { timeout: 15000 } // Supabase free-tier direct connection kadang lambat merespons (NFR-02 cold-start)
  );

  if (!existing) {
    eventBus.emitTyped("order.received", {
      externalOrderPk: saved.id,
      externalOrderId: order.externalOrderId,
      platformName,
    });
  }

  return { created: !existing, order: saved };
}

export interface OrderFilters {
  platform?: string;
  status?: string;
  sla?: string;
  page?: number;
  pageSize?: number;
}

export async function listExternalOrders(filters: OrderFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, filters.pageSize ?? PAGE_SIZE_DEFAULT));

  const where: Prisma.external_ordersWhereInput = {
    status: filters.status,
    sla_type: filters.sla,
    platforms: filters.platform ? { platform_name: filters.platform } : undefined,
  };

  const [data, total] = await prisma.$transaction([
    prisma.external_orders.findMany({
      where,
      select: {
        id: true,
        external_order_id: true,
        status: true,
        sla_type: true,
        sla_deadline: true,
        total_amount: true,
        currency: true,
        received_at: true,
        platforms: { select: { platform_name: true } },
        customers: { select: { id: true, name: true, external_username: true } },
      },
      orderBy: { sla_deadline: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.external_orders.count({ where }),
  ]);

  return { data, page, pageSize, total };
}

// raw_payload cuma diambil di detail (10.5) — daftar di atas sengaja tidak select itu.
export async function getExternalOrderById(id: string) {
  return prisma.external_orders.findUnique({
    where: { id },
    include: {
      external_order_items: true,
      platforms: true,
      customers: true,
      order_shipping_address: true,
      order_packages: true,
    },
  });
}

export async function updateExternalOrderStatus(id: string, status: string) {
  const existing = await prisma.external_orders.findUnique({ where: { id } });
  if (!existing) throw new OrderNotFoundError(`order ${id} not found`);

  const updated = await prisma.external_orders.update({ where: { id }, data: { status } });
  eventBus.emitTyped("order.status.changed", { externalOrderPk: id, status });
  return updated;
}
