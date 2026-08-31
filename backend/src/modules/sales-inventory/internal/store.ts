// backend/src/modules/sales-inventory/internal/store.ts

// "Database sementara" modul sales-inventory -- masih array biasa di
// memori, pola yang sama dengan modul auth-product. Nanti kalau tabel
// Postgres-nya sudah siap, isi file ini yang diganti jadi query beneran.
// File lain (repository.ts, service.ts, routes.ts) TIDAK perlu diubah,
// asal nama dan bentuk fungsinya tetap sama.

import { StockChangeReason } from '../../../shared/event-bus';

// Bentuk Category mengikuti tabel `categories` di prisma/schema.prisma
// dan schema Category di contracts/api.yaml.

export interface Category {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

// Beberapa kategori awal biar frontend punya data buat dicoba.
const initialCategories: Category[] = [
  {
    id: 'seed-category-1',
    name: 'Makanan',
    created_by: null,
    created_at: new Date().toISOString(),
  },
  {
    id: 'seed-category-2',
    name: 'Minuman',
    created_by: null,
    created_at: new Date().toISOString(),
  },
];

// Ini "tabel categories" versi sementara di memori.
export const categories: Category[] = [...initialCategories];

let categoryIdCounter = categories.length + 1;
export function nextCategoryId(): string {
  return `category-${categoryIdCounter++}`;
}

// ---------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------

// Bentuk Product mengikuti tabel `products` di prisma/schema.prisma dan
// schema Product di contracts/api.yaml. Kolom `category_name` TIDAK
// disimpan di sini -- itu hasil JOIN ke categories, dirakit di service.
export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  price: number;
  cost_price: number | null;
  stock_qty: number;
  low_stock_threshold: number;
  image_url: string | null;
  unit: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Beberapa produk awal biar frontend punya data buat dicoba.
const initialProducts: Product[] = [
  {
    id: 'seed-product-1',
    category_id: 'seed-category-1',
    name: 'Roti Tawar',
    sku: 'RTW-001',
    price: 15000,
    cost_price: 11000,
    stock_qty: 24,
    low_stock_threshold: 5,
    image_url: null,
    unit: 'pcs',
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'seed-product-2',
    category_id: 'seed-category-2',
    name: 'Teh Botol',
    sku: 'TBT-001',
    price: 5000,
    cost_price: 3500,
    stock_qty: 3,
    low_stock_threshold: 10,
    image_url: null,
    unit: 'botol',
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Ini "tabel products" versi sementara di memori.
export const products: Product[] = [...initialProducts];

let productIdCounter = products.length + 1;
export function nextProductId(): string {
  return `product-${productIdCounter++}`;
}

// ---------------------------------------------------------------------
// Import jobs (POST /products/import)
// ---------------------------------------------------------------------

// Status sesuai contracts/api.yaml: queued -> processing -> done/failed.
export type ImportJobStatus = 'queued' | 'processing' | 'done' | 'failed';

/** Catatan per baris: yang gagal (errors) atau yang perlu diketahui (warnings). */
export interface ImportJobRowNote {
  row: number;
  message: string;
}

export interface ImportJob {
  id: string;
  status: ImportJobStatus;
  filename: string;
  total_rows: number;
  created_count: number;
  updated_count: number;
  failed_count: number;
  errors: ImportJobRowNote[];
  warnings: ImportJobRowNote[];
  /** Diisi kalau gagal di tingkat FILE (rusak, kolom tidak dikenali, dll). */
  message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

// Ini "tabel product_import_jobs" versi sementara di memori. Karena cuma
// di memori, daftar job ini hilang kalau server restart -- nanti waktu
// pindah ke database + queue beneran (SRS 9.8/10.8), ini yang diganti.
export const importJobs: ImportJob[] = [];

let importJobIdCounter = 1;
export function nextImportJobId(): string {
  return `import-job-${importJobIdCounter++}`;
}

// ---------------------------------------------------------------------
// Transactions (checkout) & stock adjustments
// ---------------------------------------------------------------------

export type TransactionType = 'walk_in' | 'pre_order';
export type PaymentMethod = 'cash' | 'transfer' | 'ewallet';
export type TransactionStatus = 'completed' | 'voided';

export interface TransactionItem {
  id: string;
  product_id: string;
  /** Nama produk DIBEKUKAN saat transaksi terjadi. Kalau nanti produknya
   *  diganti nama atau dihapus, struk lama harus tetap kebaca apa adanya. */
  product_name_snapshot: string;
  qty: number;
  /** Harga satuan saat itu, juga dibekukan -- harga produk bisa naik besok. */
  unit_price: number;
  subtotal: number;
}

export interface Transaction {
  id: string;
  idempotency_key: string;
  type: TransactionType;
  customer_id: string | null;
  cashier_user_id: string;
  payment_method: PaymentMethod;
  subtotal: number;
  total_amount: number;
  amount_paid: number | null;
  change_amount: number | null;
  status: TransactionStatus;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  synced_offline: boolean;
  items: TransactionItem[];
  created_at: string;
}

/**
 * Versi simpanan: sama dengan Transaction plus sidik jari isi request.
 * Dipakai buat membedakan "request yang sama diulang" (balikin hasil
 * lama) dengan "Idempotency-Key dipakai ulang untuk isi yang berbeda"
 * (itu bug di pengirim, harus ditolak). Field ini TIDAK ikut dikirim
 * ke frontend.
 */
export interface StoredTransaction extends Transaction {
  request_fingerprint: string;
}

export interface StockAdjustment {
  id: string;
  product_id: string;
  /** Negatif = stok keluar, positif = stok masuk. */
  change_qty: number;
  reason: StockChangeReason;
  reference_type: 'transaction' | 'external_order' | 'manual' | null;
  reference_id: string | null;
  stock_before: number;
  stock_after: number;
  adjusted_by_user_id: string | null;
  created_at: string;
}

// Ini "tabel transactions" dan "tabel stock_adjustments" versi sementara.
export const transactions: StoredTransaction[] = [];
export const stockAdjustments: StockAdjustment[] = [];

let transactionIdCounter = 1;
export function nextTransactionId(): string {
  return `transaction-${transactionIdCounter++}`;
}

let transactionItemIdCounter = 1;
export function nextTransactionItemId(): string {
  return `transaction-item-${transactionItemIdCounter++}`;
}

let stockAdjustmentIdCounter = 1;
export function nextStockAdjustmentId(): string {
  return `stock-adjustment-${stockAdjustmentIdCounter++}`;
}
// ---------------------------------------------------------------------
// Tickets (packing / fulfillment)
// ---------------------------------------------------------------------

// Alur status menurut contracts/api.yaml. Ticket yang dibuat lewat
// POST /tickets langsung berstatus `assigned`, karena kontrak
// mewajibkan assigned_to_user_id sejak awal.
export type TicketStatus = 'unassigned' | 'assigned' | 'packing' | 'packed' | 'handed_over';

export interface TicketItem {
  id: string;
  product_id: string;
  /** Nama produk dibekukan seperti di transaksi: daftar packing yang
   *  sudah dicetak tidak boleh berubah gara-gara produknya diganti nama. */
  product_name_snapshot: string;
  qty: number;
  is_packed: boolean;
}

export interface Ticket {
  id: string;
  external_order_id: string;
  assigned_to_user_id: string | null;
  status: TicketStatus;
  assigned_at: string | null;
  assigned_by: string | null;
  completed_at: string | null;
  notes: string | null;
  items: TicketItem[];
  created_at: string;
  updated_at: string;
}

// Ini "tabel tickets" versi sementara di memori.
export const tickets: Ticket[] = [];

let ticketIdCounter = 1;
export function nextTicketId(): string {
  return `ticket-${ticketIdCounter++}`;
}

let ticketItemIdCounter = 1;
export function nextTicketItemId(): string {
  return `ticket-item-${ticketItemIdCounter++}`;
}
