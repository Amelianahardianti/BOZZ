// backend/src/modules/ecommerce-sync/sla.util.ts
// FR-OC-03 — klasifikasi SLA + hitung deadline pengiriman.

import { SlaType } from '../../shared/event-bus';

// ponytail: heuristik kata kunci pada nama kurir/logistik — klasifikasi
// asli sebaiknya datang dari metadata shipping-channel tiap platform,
// belum tersedia di semua adapter saat ini.
const INSTANT_KEYWORDS = ['instant', 'grabexpress'];
const SAME_DAY_KEYWORDS = ['same day', 'sameday', 'same_day'];

const SLA_HOURS: Record<SlaType, number> = {
  instant: 3,
  same_day: 6,
  reguler: 48, // ponytail: SRS tidak kasih angka pasti untuk "Reguler" — placeholder, sepakati ulang di tim
};

export function classifySla(shippingCarrier?: string | null): SlaType {
  const name = (shippingCarrier ?? '').toLowerCase();
  if (INSTANT_KEYWORDS.some((k) => name.includes(k))) return 'instant';
  if (SAME_DAY_KEYWORDS.some((k) => name.includes(k))) return 'same_day';
  return 'reguler';
}

export function computeSlaDeadline(receivedAt: Date, slaType: SlaType): Date {
  return new Date(receivedAt.getTime() + SLA_HOURS[slaType] * 60 * 60 * 1000);
}
