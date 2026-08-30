// backend/src/shared/event-bus.ts

// Event bus in-process (singleton) — dipakai lintas modul untuk
// publish/subscribe tanpa broker eksternal (SRS 4.3 & 9.4).
//
// Kenapa dibungkus, bukan pakai EventEmitter mentah:
//  1. Nama event + bentuk payload dikunci lewat TypeScript, jadi salah
//     ketik nama event atau kurang field ketahuan pas compile, bukan
//     pas demo.
//  2. Listener yang error TIDAK ikut menjatuhkan publisher-nya. Contoh
//     nyata: kasir checkout -> publish 'stock.updated' -> listener
//     ecommerce-sync gagal karena API Shopee down. Checkout-nya harus
//     tetap sukses; kegagalan sync urusan modul sync, bukan kasir.
//
// PERHATIAN (batasan yang disepakati bertiga): bus ini TIDAK persisten.
// Kalau proses crash setelah publish() tapi sebelum listener selesai,
// event hilang tanpa jejak. Untuk event kritikal (stock.updated,
// order.received), consumer WAJIB catat processed_at agar bisa
// direkonsiliasi manual/berkala.

import { EventEmitter } from 'events';

// ---------------------------------------------------------------------
// Tipe payload — cerminan dari contracts/events/*.schema.json.
// Kalau schema JSON-nya berubah, file ini WAJIB ikut diubah.
// ---------------------------------------------------------------------

/** Alasan stok berubah (contracts/events/stock-updated.schema.json). */
export type StockChangeReason =
  | 'sale'
  | 'manual_adjustment'
  | 'void_reversal'
  | 'external_order'
  | 'restock';

/** Tipe SLA order marketplace (contracts/events/order-received.schema.json). */
export type SlaType = 'instant' | 'same_day' | 'reguler';

/** Status ticket/order (contracts/events/order-status-changed.schema.json). */
export type OrderStatus = 'new' | 'processing' | 'shipped' | 'completed' | 'cancelled';

/**
 * Dipublikasikan sales-inventory saat stok produk berubah.
 * Dikonsumsi ecommerce-sync untuk update stok ke semua platform.
 */
export interface StockUpdatedPayload {
  product_id: string;
  /** Selisih perubahan; negatif untuk pengurangan. Opsional di schema. */
  change_qty?: number;
  stock_after: number;
  reason: StockChangeReason;
  occurred_at: string;
}

/**
 * Dipublikasikan ecommerce-sync saat order baru masuk dari platform.
 * Dikonsumsi sales-inventory untuk diproses/di-ticket-kan.
 */
export interface OrderReceivedPayload {
  external_order_id: string;
  platform_id: string;
  sla_type: SlaType;
  sla_deadline?: string;
  occurred_at: string;
}

/**
 * Dipublikasikan sales-inventory saat status ticket/order berubah.
 * Dikonsumsi ecommerce-sync untuk diteruskan ke platform asal.
 */
export interface OrderStatusChangedPayload {
  external_order_id: string;
  new_status: OrderStatus;
  occurred_at: string;
}

/** Peta nama event -> bentuk payload-nya. Sumber kebenaran tipe bus ini. */
export interface EventPayloads {
  'stock.updated': StockUpdatedPayload;
  'order.received': OrderReceivedPayload;
  'order.status.changed': OrderStatusChangedPayload;
}

export type EventName = keyof EventPayloads;

// Konstanta nama event. Pakai ini biar tidak ada typo string yang
// tersebar di banyak modul.
export const EVENTS = {
  STOCK_UPDATED: 'stock.updated',
  ORDER_RECEIVED: 'order.received',
  ORDER_STATUS_CHANGED: 'order.status.changed',
} as const;

/**
 * Payload versi input: `occurred_at` boleh dikosongkan, nanti diisi
 * otomatis oleh publish(). Diisi manual hanya kalau waktu kejadian
 * aslinya beda dari waktu publish — misal order lama yang baru ditarik
 * dari marketplace.
 */
export type PublishInput<E extends EventName> = Omit<EventPayloads[E], 'occurred_at'> & {
  occurred_at?: string;
};

/** Handler boleh sync atau async; dua-duanya error-nya ditangkap bus. */
export type EventHandler<E extends EventName> = (payload: EventPayloads[E]) => void | Promise<void>;

/** Detail kegagalan sebuah listener, dikirim ke reporter. */
export interface HandlerFailure {
  event: EventName;
  payload: EventPayloads[EventName];
  error: unknown;
}

// ---------------------------------------------------------------------
// Implementasi
// ---------------------------------------------------------------------

const emitter = new EventEmitter();

// Default Node cuma 10 listener per event, lewat itu dia print warning
// "possible memory leak". 3 modul + test bisa nembus angka itu padahal
// wajar, jadi dinaikkan.
emitter.setMaxListeners(50);

const logFailure = (failure: HandlerFailure): void => {
  console.error(`[event-bus] listener '${failure.event}' gagal:`, failure.error);
};

let reportFailure: (failure: HandlerFailure) => void = logFailure;

/**
 * Ganti cara kegagalan listener dilaporkan (default: console.error).
 * Nanti bisa diarahkan ke logger/alert supaya event yang gagal diproses
 * tidak diam-diam hilang.
 */
export function onHandlerError(reporter: (failure: HandlerFailure) => void): void {
  reportFailure = reporter;
}

/**
 * Kirim event ke semua listener yang terdaftar.
 *
 * Listener dijalankan SINKRON sesuai urutan daftar, tapi listener async
 * tidak ditunggu. Jadi setelah publish() selesai belum tentu efek
 * sampingnya sudah jadi — jangan bikin logic yang bergantung ke situ.
 *
 * @returns payload final (sudah lengkap dengan occurred_at), berguna
 *          untuk dicatat/di-log oleh pemanggil.
 */
export function publish<E extends EventName>(
  event: E,
  payload: PublishInput<E>
): EventPayloads[E] {
  // Cast dibutuhkan karena TypeScript tidak bisa membuktikan sendiri
  // bahwa Omit<...> + occurred_at kembali utuh jadi EventPayloads[E].
  const fullPayload = {
    ...payload,
    occurred_at: payload.occurred_at ?? new Date().toISOString(),
  } as EventPayloads[E];

  emitter.emit(event, fullPayload);
  return fullPayload;
}

/**
 * Daftarkan listener untuk sebuah event.
 *
 * Error di dalam handler (sync maupun rejected promise) ditangkap di
 * sini, jadi tidak merambat ke publisher dan tidak menjatuhkan proses.
 *
 * @returns fungsi untuk berhenti berlangganan.
 */
export function subscribe<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
  const wrapped = (...args: unknown[]): void => {
    const payload = args[0] as EventPayloads[E];
    try {
      const result = handler(payload);
      if (result instanceof Promise) {
        result.catch((error: unknown) => reportFailure({ event, payload, error }));
      }
    } catch (error) {
      reportFailure({ event, payload, error });
    }
  };

  emitter.on(event, wrapped);
  return () => {
    emitter.off(event, wrapped);
  };
}

/** Jumlah listener sebuah event — untuk keperluan test/diagnosa. */
export function listenerCount(event: EventName): number {
  return emitter.listenerCount(event);
}

/**
 * Bersihkan semua listener dan kembalikan reporter ke default.
 * HANYA untuk test — jangan dipanggil dari kode produksi, nanti modul
 * lain kehilangan langganannya.
 */
export function resetEventBus(): void {
  emitter.removeAllListeners();
  reportFailure = logFailure;
}
