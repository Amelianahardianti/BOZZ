// backend/src/modules/ecommerce-sync/service.ts

// "Aturan main" modul ini: SLA calc, dedup order, customer matching,
// forward status ke platform. routes.ts manggil fungsi di sini, logic
// beneran ada di sini + repository.ts (bukan di routes.ts).

import * as repo from './repository';
import { getAdapter, isPlatformConfigured, platformAdapters } from './adapters/registry';
import { classifySla, computeSlaDeadline } from './sla.util';
import { notFound, conflict } from '../../shared/errors';
import { publish, subscribe, EVENTS } from '../../shared/event-bus';
import type { NormalizedOrder } from './types';

const SYNC_LOOKBACK_SECONDS = 15 * 24 * 60 * 60; // ponytail: window tetap 15 hari, jadikan configurable kalau perlu backfill lebih dalam
type PlatformRow = NonNullable<Awaited<ReturnType<typeof repo.findPlatformRow>>>;

// ---------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------

function toPlatformDto(row: Awaited<ReturnType<typeof repo.findPlatformRow>>, platformName?: string) {
  if (!row) {
    return {
      id: null,
      platform_name: platformName,
      shop_id_external: null,
      token_expires_at: null,
      is_connected: false,
      last_synced_at: null,
      last_sync_status: null,
      configured: platformName ? isPlatformConfigured(platformName) : false,
    };
  }
  return {
    id: row.id,
    platform_name: row.platform_name,
    shop_id_external: row.shop_id_external,
    token_expires_at: row.token_expires_at,
    is_connected: row.is_connected,
    last_synced_at: row.last_synced_at,
    last_sync_status: row.last_sync_status,
    configured: isPlatformConfigured(row.platform_name),
  };
}

export async function listPlatforms() {
  const known = Object.keys(platformAdapters);
  const rows = await repo.listPlatformRows();
  const byName = new Map(rows.map((r: PlatformRow) => [r.platform_name, r]));

  // Tampilkan SEMUA platform yang punya adapter terdaftar, walau belum
  // pernah connect sama sekali (row-nya belum ada) — supaya dashboard bisa
  // nunjukin NOT_CONFIGURED/belum connect, bukan cuma diam-diam hilang.
  return known.map((name) => toPlatformDto(byName.get(name) ?? null, name));
}

export function getAuthorizationUrl(platformName: string, state?: string) {
  return getAdapter(platformName).buildAuthorizationUrl(state);
}

export async function connectPlatform(platformName: string, oauthCode?: string, shopIdExternal?: string) {
  const adapter = getAdapter(platformName);
  if (!oauthCode) {
    throw conflict('oauth_code wajib diisi untuk connect platform ini.');
  }
  await adapter.exchangeCodeForToken(oauthCode, shopIdExternal);
  const row = await repo.findPlatformRow(platformName);
  return toPlatformDto(row, platformName);
}

export async function disconnectPlatform(platformName: string) {
  getAdapter(platformName); // validasi platform dikenal
  const row = await repo.disconnectPlatform(platformName);
  return toPlatformDto(row, platformName);
}

export async function syncPlatform(platformName: string) {
  const adapter = getAdapter(platformName);
  const platformRow = await repo.findPlatformRow(platformName);
  if (!platformRow || !platformRow.is_connected) {
    throw conflict(`Platform "${platformName}" belum terhubung.`);
  }

  // Balas cepat ke caller (kontrak: 202), proses sync di background —
  // SRS 9.8, proses berat tidak boleh blocking siklus request-response.
  void runSync(platformName, adapter, platformRow.id).catch((err) => {
    console.error(`[ecommerce-sync] sync ${platformName} gagal:`, err);
  });

  return toPlatformDto(platformRow, platformName);
}

async function runSync(platformName: string, adapter: ReturnType<typeof getAdapter>, platformId: string) {
  try {
    const creds = await adapter.getValidAccessToken();
    const orders = await adapter.fetchRecentOrders(creds, SYNC_LOOKBACK_SECONDS);
    for (const order of orders) {
      await upsertExternalOrder(platformId, platformName, order);
    }
    await repo.markSyncResult(platformName, 'success');
  } catch (err) {
    await repo.markSyncResult(platformName, 'failed');
    throw err;
  }
}

// ---------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------

async function findOrCreateCustomer(platformName: string, buyerUsername?: string) {
  if (!buyerUsername) return null;
  const existing = await repo.findCustomerByExternalUsername(platformName, buyerUsername);
  if (existing) return existing;
  return repo.createCustomerFromMarketplace(platformName, buyerUsername);
}

/**
 * Upsert 1 order dari adapter, dedup by (platform_id, external_order_id) —
 * mekanisme idempotency SRS 9.3 / FR-OC-04. Dipakai baik oleh sync manual
 * maupun webhook.
 */
export async function upsertExternalOrder(platformId: string, platformName: string, order: NormalizedOrder) {
  const customer = await findOrCreateCustomer(platformName, order.buyerUsername);
  const existing = await repo.findExternalOrder(platformId, order.externalOrderId);

  const receivedAt = existing?.received_at ?? new Date();
  const slaType = (existing?.sla_type as 'instant' | 'same_day' | 'reguler' | undefined) ?? classifySla(order.shippingCarrier);
  const slaDeadline = existing?.sla_deadline ?? computeSlaDeadline(receivedAt, slaType);

  const row = await repo.upsertExternalOrderRow({
    platformId,
    externalOrderId: order.externalOrderId,
    customerId: customer?.id ?? null,
    status: order.status,
    slaType,
    slaDeadline,
    receivedAt,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    rawPayload: order.rawPayload,
    items: order.items,
  });

  if (!existing) {
    publish(EVENTS.ORDER_RECEIVED, {
      external_order_id: row.id,
      platform_id: platformId,
      sla_type: slaType,
      sla_deadline: slaDeadline.toISOString(),
    });
  }

  return { created: !existing, order: row };
}

export interface OrderListQuery {
  platformId?: string;
  status?: string;
  slaType?: string;
  page?: number;
  limit?: number;
}

export async function listOrders(query: OrderListQuery) {
  return repo.listExternalOrderRows({
    platformId: query.platformId,
    status: query.status,
    slaType: query.slaType,
    page: query.page ?? 1,
    limit: query.limit ?? 20,
  });
}

export async function getOrderDetail(id: string) {
  const order = await repo.getExternalOrderDetailRow(id);
  if (!order) throw notFound('Order tidak ditemukan.');
  return order;
}

/**
 * Update status order (jalur MANUAL — Owner override lewat PATCH
 * /orders/:id/status) lalu emit order.status.changed. Forward-ke-platform
 * TIDAK dipanggil langsung di sini — satu-satunya tempat yang forward
 * adalah subscriber di bawah, supaya jalur manual ini dan jalur otomatis
 * dari sales-inventory (ticket packing selesai) sama-sama lewat forward
 * yang sama persis, bukan dobel.
 */
export async function updateOrderStatus(id: string, status: string) {
  const existing = await repo.getExternalOrderDetailRow(id);
  if (!existing) throw notFound('Order tidak ditemukan.');

  const updated = await repo.updateExternalOrderStatusRow(id, status);

  publish(EVENTS.ORDER_STATUS_CHANGED, {
    external_order_id: id,
    new_status: status as 'new' | 'processing' | 'shipped' | 'completed' | 'cancelled',
  });

  return updated;
}

async function forwardStatusToPlatform(platformId: string, externalOrderId: string, status: string) {
  const platformRow = await repo.findPlatformById(platformId);
  if (!platformRow) return;

  const adapter = platformAdapters[platformRow.platform_name];
  if (!adapter?.updateOrderStatusOnPlatform) return; // adapter belum dukung forward — lewati, jangan gagalkan request

  try {
    const creds = await adapter.getValidAccessToken();
    await adapter.updateOrderStatusOnPlatform(creds, externalOrderId, status);
  } catch (err) {
    console.error(`[ecommerce-sync] gagal forward status ke ${platformRow.platform_name}:`, err);
  }
}

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------

export async function searchCustomers(query: string) {
  const q = query.trim();
  if (!q) return [];
  return repo.searchCustomers(q);
}

// ---------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------

export async function handleWebhook(
  platformName: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  payload: unknown
) {
  const adapter = getAdapter(platformName);
  if (!adapter.verifyWebhookSignature || !adapter.normalizeWebhookPayload) {
    throw conflict(`Webhook belum didukung untuk platform "${platformName}".`);
  }
  if (!adapter.verifyWebhookSignature(rawBody, headers)) {
    throw conflict('Signature webhook tidak valid.');
  }

  const normalized = adapter.normalizeWebhookPayload(payload);
  if (!normalized) return;

  const platformRow = await repo.findPlatformRow(platformName);
  if (!platformRow) return;

  await upsertExternalOrder(platformRow.id, platformName, normalized);
}

// ---------------------------------------------------------------------
// Event subscriber — order.status.changed dari sales-inventory (ticket
// packing selesai) diteruskan ke platform asal (SRS 8.2/§4.3).
// ---------------------------------------------------------------------

subscribe(EVENTS.ORDER_STATUS_CHANGED, async (payload) => {
  const order = await repo.getExternalOrderDetailRow(payload.external_order_id).catch(() => null);
  if (!order) return;
  await forwardStatusToPlatform(order.platform_id, order.external_order_id, payload.new_status);
});
