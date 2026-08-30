import type { NormalizedOrder } from "./platform-adapter.types";

// Fixture per §Task Manifest "Mock Marketplace Data Layer" — mencakup multi-order,
// duplicate-order (dua entri externalOrderId yang sama dalam satu batch, buat
// membuktikan dedup jalan bukan cuma antar sync tapi juga dalam satu batch), dan
// varian SLA (instant/same_day/reguler) lewat nama shippingCarrier.

function makeShopeeFixtures(): NormalizedOrder[] {
  return [
    {
      externalOrderId: "MOCK-SHOPEE-001",
      status: "new",
      externalStatusRaw: "UNPAID",
      totalAmount: 125000,
      currency: "IDR",
      buyerUsername: "budi_santoso",
      shippingCarrier: "GrabExpress Instant",
      rawPayload: { source: "mock-shopee", note: "instant SLA" },
      items: [{ externalItemRef: "ITEM-001", itemName: "Kaos Polos Hitam", qty: 2, unitPrice: 62500 }],
    },
    {
      externalOrderId: "MOCK-SHOPEE-002",
      status: "processing",
      externalStatusRaw: "PROCESSED",
      totalAmount: 89000,
      currency: "IDR",
      buyerUsername: "sri_wahyuni",
      shippingCarrier: "JNE Same Day",
      rawPayload: { source: "mock-shopee", note: "same_day SLA" },
      items: [{ externalItemRef: "ITEM-002", itemName: "Celana Jeans", qty: 1, unitPrice: 89000 }],
    },
    // Duplicate externalOrderId dalam 1 batch — bukti dedup jalan di dalam satu sync call.
    {
      externalOrderId: "MOCK-SHOPEE-003",
      status: "new",
      externalStatusRaw: "UNPAID",
      totalAmount: 45000,
      currency: "IDR",
      buyerUsername: "andi_wijaya",
      shippingCarrier: "JNE Reguler",
      rawPayload: { source: "mock-shopee", note: "reguler SLA — versi pertama" },
      items: [{ externalItemRef: "ITEM-003", itemName: "Kaos Kaki", qty: 3, unitPrice: 15000 }],
    },
    {
      externalOrderId: "MOCK-SHOPEE-003",
      status: "processing",
      externalStatusRaw: "PROCESSED",
      totalAmount: 45000,
      currency: "IDR",
      buyerUsername: "andi_wijaya",
      shippingCarrier: "JNE Reguler",
      rawPayload: { source: "mock-shopee", note: "reguler SLA — versi kedua (harus update, bukan duplikat baris)" },
      items: [{ externalItemRef: "ITEM-003", itemName: "Kaos Kaki", qty: 3, unitPrice: 15000 }],
    },
    {
      externalOrderId: "MOCK-SHOPEE-004",
      status: "cancelled",
      externalStatusRaw: "CANCELLED",
      totalAmount: 250000,
      currency: "IDR",
      buyerUsername: "dewi_lestari",
      rawPayload: { source: "mock-shopee", note: "cancelled" },
      items: [{ externalItemRef: "ITEM-004", itemName: "Sepatu Sneakers", qty: 1, unitPrice: 250000 }],
    },
  ];
}

function makeTiktokFixtures(): NormalizedOrder[] {
  return [
    {
      externalOrderId: "MOCK-TIKTOK-001",
      status: "new",
      externalStatusRaw: "UNPAID",
      totalAmount: 150000,
      currency: "IDR",
      isCod: false,
      buyerUsername: "rina_amelia",
      shippingCarrier: "GrabExpress Instant",
      rawPayload: { source: "mock-tiktok", note: "instant SLA" },
      items: [{ externalItemRef: "TT-ITEM-001", itemName: "Tumbler Custom", qty: 1, unitPrice: 150000 }],
    },
    {
      externalOrderId: "MOCK-TIKTOK-002",
      status: "shipped",
      externalStatusRaw: "IN_TRANSIT",
      totalAmount: 320000,
      currency: "IDR",
      isCod: true,
      buyerUsername: "fajar_nugroho",
      shippingCarrier: "SiCepat Reguler",
      rawPayload: { source: "mock-tiktok", note: "reguler SLA, COD" },
      items: [
        { externalItemRef: "TT-ITEM-002", itemName: "Skincare Set", qty: 1, unitPrice: 220000 },
        { externalItemRef: "TT-ITEM-003", itemName: "Masker Wajah", qty: 2, unitPrice: 50000 },
      ],
    },
    {
      externalOrderId: "MOCK-TIKTOK-003",
      status: "completed",
      externalStatusRaw: "COMPLETED",
      totalAmount: 75000,
      currency: "IDR",
      buyerUsername: "budi_santoso", // sengaja sama dengan buyer Shopee — cek customer matching per-platform (source beda, row beda)
      shippingCarrier: "JNE Same Day",
      rawPayload: { source: "mock-tiktok", note: "same_day SLA, completed" },
      items: [{ externalItemRef: "TT-ITEM-004", itemName: "Case HP", qty: 1, unitPrice: 75000 }],
    },
  ];
}

export const mockFixtures: Record<string, NormalizedOrder[]> = {
  shopee: makeShopeeFixtures(),
  tiktok: makeTiktokFixtures(),
};
