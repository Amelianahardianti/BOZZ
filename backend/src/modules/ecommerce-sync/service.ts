// backend/src/modules/ecommerce-sync/service.ts

// "Aturan main" modul ini: SLA calc, dedup order, customer matching,
// forward status ke platform. routes.ts manggil fungsi di sini, logic
// beneran ada di sini + repository.ts (bukan di routes.ts).

import * as repo from './repository';
import { getAdapter, isPlatformConfigured, platformAdapters } from './adapters/registry';
import { classifySla, computeSlaDeadline } from './sla.util';
import { notFound, conflict, unauthorized } from '../../shared/errors';
import { publish, subscribe, EVENTS } from '../../shared/event-bus';
import { createNotification, listStaff } from '../auth-product';
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

// CRM v2 (FR-OC-10). CATATAN: FR-OC-10 & contracts/api.yaml menyebut
// "riwayat transaksi & analitik" di summary endpoint detail, tapi TIDAK
// ADA field/rumus untuk itu di schema Customer manapun (contracts/api.yaml,
// schema.prisma) -- sengaja TIDAK diimplementasikan di sini supaya tidak
// mengarang bentuk data yang belum disepakati. Lihat laporan audit.

export async function listCustomers() {
  return repo.listCustomers();
}

export async function getCustomerDetail(id: string) {
  const customer = await repo.findCustomerById(id);
  if (!customer) throw notFound('Customer tidak ditemukan.');
  return customer;
}

export async function createCustomer(input: repo.CustomerWriteInput) {
  return repo.createCustomer(input);
}

export async function updateCustomerDetail(id: string, input: repo.CustomerWriteInput) {
  const existing = await repo.findCustomerById(id);
  if (!existing) throw notFound('Customer tidak ditemukan.');
  return repo.updateCustomer(id, input);
}

// ---------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------

/**
 * Verifikasi SAJA (tidak menyentuh DB/side effect apapun) -- dipanggil
 * routes.ts SEBELUM balas response apapun ke pengirim webhook (SRS 9.5:
 * "verifikasi sebelum balas 2xx"; contracts/api.yaml: 401 kalau signature
 * tidak valid). Fungsi murni & cepat (HMAC compute doang), jadi aman
 * dipanggil sinkron di jalur request-response tanpa melanggar SRS 9.8
 * (proses BERAT yang tidak boleh blocking -- ini bukan itu).
 *
 * Platform yang tidak dikenal sama sekali -> 404 (lewat getAdapter()).
 * Platform dikenal tapi belum dukung webhook (mis. FakeStore, Shopee
 * sekarang) -> 409, bukan 401 -- ini bukan soal signature, tapi fitur
 * yang memang belum ada untuk platform itu.
 */
export function verifyWebhookRequest(
  platformName: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
): void {
  const adapter = getAdapter(platformName);
  if (!adapter.verifyWebhookSignature || !adapter.normalizeWebhookPayload) {
    throw conflict(`Webhook belum didukung untuk platform "${platformName}".`);
  }
  if (!adapter.verifyWebhookSignature(rawBody, headers)) {
    throw unauthorized('Signature webhook tidak valid.');
  }
}

/**
 * Proses detail order dari webhook yang SUDAH lolos verifyWebhookRequest().
 * Dipanggil async SETELAH response 2xx dikirim (SRS 9.5) -- tapi tetap
 * memanggil verifyWebhookRequest() lagi di awal (murah, tanpa side effect)
 * supaya fungsi ini aman dipanggil independen (mis. dari test atau
 * reprocessing manual) tanpa bergantung urutan pemanggilan di routes.ts.
 */
export async function handleWebhook(
  platformName: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  payload: unknown
) {
  verifyWebhookRequest(platformName, rawBody, headers);

  const adapter = getAdapter(platformName);
  const normalized = adapter.normalizeWebhookPayload!(payload);
  if (!normalized) return;

  const platformRow = await repo.findPlatformRow(platformName);
  if (!platformRow) return;

  await upsertExternalOrder(platformRow.id, platformName, normalized);
}

// ---------------------------------------------------------------------
// Event subscriber — order.status.changed dari sales-inventory (ticket
// packing selesai) diteruskan ke platform asal (SRS 8.2/§4.3).
// ---------------------------------------------------------------------

// Idempotency guard in-memory (Step 8) -- kalau event yang SAMA PERSIS
// (order + status tujuan yang sama) entah kenapa terkirim lebih dari
// sekali dalam 1 lifetime proses, jangan forward dobel ke platform. Bukan
// idempotency lintas restart (event bus in-process memang tidak
// persisten, sudah jadi batasan yang disepakati -- SRS 9.4), dan sengaja
// per-(order, status) bukan per-order saja: satu order boleh melewati
// beberapa status berbeda (new -> processing -> shipped -> ...), semua
// tetap harus di-forward.
const statusForwardedFor = new Set<string>();

subscribe(EVENTS.ORDER_STATUS_CHANGED, async (payload) => {
  const dedupKey = `${payload.external_order_id}:${payload.new_status}`;
  if (statusForwardedFor.has(dedupKey)) return;
  statusForwardedFor.add(dedupKey);

  const order = await repo.getExternalOrderDetailRow(payload.external_order_id).catch(() => null);
  if (!order) return;
  await forwardStatusToPlatform(order.platform_id, order.external_order_id, payload.new_status);
});

// ---------------------------------------------------------------------
// SLA Escalation (FR-OC-09) — "order mendekati deadline SLA namun belum
// ada ticket".
//
// TIDAK ada trigger otomatis (cron/scheduler) yang memanggil fungsi ini —
// project ini belum punya infrastruktur scheduler sama sekali (tidak ada
// node-cron/agenda/bull di dependencies, tidak ada pola cron lain di
// backend/src). Menambah library scheduler baru malam ini bukan keputusan
// yang bisa diambil sepihak, jadi TIDAK ditambahkan. Fungsi ini harus
// dipanggil manual (mis. dari REPL/script operasional) sampai tim
// menyepakati mekanisme trigger-nya (cron proses terpisah? cek saat
// GET /orders dipanggil? worker terjadwal?).
//
// Threshold "mendekati deadline" JUGA tidak ada angka resminya di SRS/
// contracts/api.yaml/schema — WAJIB di-set lewat env
// SLA_ESCALATION_THRESHOLD_MINUTES, TIDAK di-hardcode ke angka tebakan.
// Kalau env ini belum di-set, fungsi menolak jalan (throw) — supaya gagal
// jelas kalau memang belum dikonfigurasi, bukan diam-diam pakai angka
// yang tidak disepakati siapa pun.
// ---------------------------------------------------------------------

export interface SlaEscalationResult {
  /** Jumlah order yang baru pertama kali dikirimi notifikasi eskalasi. */
  notified: number;
  /** Jumlah order yang eligible tapi sudah pernah dikirimi sebelumnya (dedup). */
  skipped: number;
}

export async function runSlaEscalationCheck(now: Date = new Date()): Promise<SlaEscalationResult> {
  const thresholdRaw = process.env.SLA_ESCALATION_THRESHOLD_MINUTES;
  if (!thresholdRaw) {
    throw new Error(
      'SLA_ESCALATION_THRESHOLD_MINUTES belum di-set. FR-OC-09 tidak menyebutkan angka "mendekati deadline" ' +
        'yang resmi — set env ini dulu (hasil kesepakatan tim) sebelum menjalankan pengecekan eskalasi.'
    );
  }
  const thresholdMinutes = Number(thresholdRaw);
  if (!Number.isFinite(thresholdMinutes) || thresholdMinutes <= 0) {
    throw new Error('SLA_ESCALATION_THRESHOLD_MINUTES harus berupa angka menit yang positif.');
  }
  const windowMs = thresholdMinutes * 60 * 1000;

  const candidates = await repo.findOrdersNeedingEscalation(now, windowMs);
  let notified = 0;
  let skipped = 0;
  let owners: Awaited<ReturnType<typeof listStaff>> | null = null;

  for (const order of candidates) {
    if (await repo.hasEscalationNotification(order.id)) {
      skipped++;
      continue;
    }

    // listStaff() cuma diambil sekali, dipakai ulang untuk tiap order --
    // daftar staf tidak berubah dalam satu kali jalan fungsi ini.
    if (!owners) {
      const staff = await listStaff();
      owners = staff.filter((s) => s.role === 'owner' && s.is_active);
    }

    for (const owner of owners) {
      try {
        await createNotification({
          userId: owner.id,
          type: repo.SLA_ESCALATION_NOTIFICATION_TYPE,
          title: 'Order mendekati deadline SLA, belum ada ticket',
          message: `Order ${order.external_order_id} (SLA ${order.sla_type}) mendekati deadline dan belum punya ticket packing.`,
          referenceType: 'external_order',
          referenceId: order.id,
        });
      } catch (err) {
        // Gagal notifikasi ke 1 owner TIDAK boleh menghentikan pengecekan
        // order lain -- pola sama dengan sales-inventory/event-subscribers.ts.
        console.error(`[ecommerce-sync] gagal bikin notifikasi eskalasi SLA untuk owner ${owner.id}`, err);
      }
    }
    notified++;
  }

  return { notified, skipped };
}
