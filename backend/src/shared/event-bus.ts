import { EventEmitter } from 'events';

// Singleton event bus in-process — dipakai lintas modul untuk
// publish/subscribe tanpa broker eksternal (SRS 4.3 & 9.4).
// PERHATIAN: tidak persisten — kalau proses crash setelah emit()
// tapi sebelum listener selesai, event hilang tanpa jejak.
// Untuk event kritikal (stock.updated, order.received), consumer
// WAJIB catat processed_at agar bisa direkonsiliasi manual/berkala.
export const eventBus = new EventEmitter();

export const EVENTS = {
  STOCK_UPDATED: 'stock.updated',
  ORDER_RECEIVED: 'order.received',
  ORDER_STATUS_CHANGED: 'order.status.changed',
} as const;
