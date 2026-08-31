// backend/src/modules/sales-inventory/repository.ts

// Semua fungsi di sini cuma "ngobrol" sama internal/store.ts.
// service.ts tidak boleh langsung nyentuh internal/store.ts, harus lewat
// fungsi-fungsi yang disediakan di sini. Tujuannya: kalau nanti store.ts
// diganti jadi query database asli, service.ts tidak perlu diubah.

import {
  categories,
  nextCategoryId,
  products,
  nextProductId,
  importJobs,
  nextImportJobId,
  transactions,
  stockAdjustments,
  nextTransactionId,
  nextTransactionItemId,
  nextStockAdjustmentId,
  Category,
  Product,
  ImportJob,
  StoredTransaction,
  StockAdjustment,
  TransactionType,
  PaymentMethod,
  tickets,
  nextTicketId,
  nextTicketItemId,
  Ticket,
} from './internal/store';
import { StockChangeReason } from '../../shared/event-bus';
import { conflict, notFound } from '../../shared/errors';

// ---------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  // Urut A-Z biar dropdown kategori di frontend gampang dibaca.
  return [...categories].sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

export async function findCategoryById(id: string): Promise<Category | null> {
  return categories.find((c) => c.id === id) ?? null;
}

/**
 * Cari kategori berdasarkan nama, TANPA membedakan huruf besar/kecil.
 * Dipakai buat cek duplikat: "Minuman" dan "minuman" dianggap sama,
 * karena di DB kolom name-nya unique dan user tidak akan paham kenapa
 * boleh ada dua kategori yang kelihatannya identik.
 */
export async function findCategoryByName(name: string): Promise<Category | null> {
  const needle = name.toLowerCase();
  return categories.find((c) => c.name.toLowerCase() === needle) ?? null;
}

export async function createCategory(input: {
  name: string;
  created_by: string | null;
}): Promise<Category> {
  const newCategory: Category = {
    id: nextCategoryId(),
    name: input.name,
    created_by: input.created_by,
    created_at: new Date().toISOString(),
  };
  categories.push(newCategory);
  return newCategory;
}

/** Ambil beberapa kategori sekaligus, buat kebutuhan JOIN di service. */
export async function findCategoriesByIds(ids: string[]): Promise<Category[]> {
  const wanted = new Set(ids);
  return categories.filter((c) => wanted.has(c.id));
}

// ---------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------

export interface ListProductsFilter {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

/**
 * Cari produk dengan filter + pagination.
 *
 * `total` dihitung dari hasil filter SEBELUM dipotong per halaman --
 * frontend butuh angka itu buat nampilin "menampilkan 20 dari 137".
 */
export async function listProducts(
  filter: ListProductsFilter
): Promise<{ data: Product[]; total: number }> {
  const search = filter.search?.toLowerCase();

  const matched = products.filter((p) => {
    if (filter.categoryId && p.category_id !== filter.categoryId) return false;
    if (filter.isActive !== undefined && p.is_active !== filter.isActive) return false;
    if (search) {
      // Kasir biasanya ngetik sebagian nama, atau scan/ketik SKU.
      const haystack = `${p.name} ${p.sku ?? ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  matched.sort((a, b) => a.name.localeCompare(b.name, 'id'));

  const start = (filter.page - 1) * filter.limit;
  return { data: matched.slice(start, start + filter.limit), total: matched.length };
}

export async function findProductById(id: string): Promise<Product | null> {
  return products.find((p) => p.id === id) ?? null;
}

/**
 * Cari produk berdasarkan SKU (case-insensitive). Dipakai buat cek
 * duplikat, karena di DB kolom sku-nya unique.
 */
export async function findProductBySku(sku: string): Promise<Product | null> {
  const needle = sku.toLowerCase();
  return products.find((p) => p.sku?.toLowerCase() === needle) ?? null;
}

export async function createProduct(input: {
  name: string;
  sku: string | null;
  category_id: string | null;
  price: number;
  stock_qty: number;
  low_stock_threshold: number;
  image_url: string | null;
  unit: string | null;
  created_by: string | null;
}): Promise<Product> {
  const now = new Date().toISOString();
  const newProduct: Product = {
    id: nextProductId(),
    category_id: input.category_id,
    name: input.name,
    sku: input.sku,
    price: input.price,
    cost_price: null,
    stock_qty: input.stock_qty,
    low_stock_threshold: input.low_stock_threshold,
    image_url: input.image_url,
    unit: input.unit,
    is_active: true,
    created_by: input.created_by,
    created_at: now,
    updated_at: now,
  };
  products.push(newProduct);
  return newProduct;
}

/**
 * Update sebagian kolom produk. Sengaja TIDAK menerima `stock_qty`:
 * perubahan stok wajib lewat stock-adjustments supaya ada jejaknya
 * (contracts/api.yaml, Form_Web_MVP #15).
 */
export async function updateProduct(
  id: string,
  changes: Partial<
    Pick<
      Product,
      'name' | 'sku' | 'category_id' | 'price' | 'low_stock_threshold' | 'image_url' | 'unit' | 'is_active'
    >
  >
): Promise<Product | null> {
  const product = products.find((p) => p.id === id);
  if (!product) return null;
  Object.assign(product, changes, { updated_at: new Date().toISOString() });
  return product;
}

// ---------------------------------------------------------------------
// Import jobs
// ---------------------------------------------------------------------

export async function createImportJob(input: {
  filename: string;
  created_by: string | null;
}): Promise<ImportJob> {
  const now = new Date().toISOString();
  const job: ImportJob = {
    id: nextImportJobId(),
    status: 'queued',
    filename: input.filename,
    total_rows: 0,
    created_count: 0,
    updated_count: 0,
    failed_count: 0,
    errors: [],
    warnings: [],
    message: null,
    created_by: input.created_by,
    created_at: now,
    updated_at: now,
    finished_at: null,
  };
  importJobs.push(job);
  return job;
}

export async function findImportJobById(id: string): Promise<ImportJob | null> {
  return importJobs.find((j) => j.id === id) ?? null;
}

export async function updateImportJob(
  id: string,
  changes: Partial<Omit<ImportJob, 'id' | 'created_at' | 'created_by'>>
): Promise<ImportJob | null> {
  const job = importJobs.find((j) => j.id === id);
  if (!job) return null;
  Object.assign(job, changes, { updated_at: new Date().toISOString() });
  return job;
}

// ---------------------------------------------------------------------
// Transactions (checkout)
// ---------------------------------------------------------------------

export async function findTransactionByIdempotencyKey(
  key: string
): Promise<StoredTransaction | null> {
  return transactions.find((t) => t.idempotency_key === key) ?? null;
}

export async function findTransactionById(id: string): Promise<StoredTransaction | null> {
  return transactions.find((t) => t.id === id) ?? null;
}

export interface ListTransactionsFilter {
  /** Batas bawah, sudah berupa waktu absolut (awal hari). */
  createdFrom?: Date;
  /** Batas atas, sudah berupa waktu absolut (akhir hari). */
  createdTo?: Date;
  paymentMethod?: PaymentMethod;
  /**
   * walk_in  = transaksi tanpa data pelanggan (pembeli datang langsung)
   * marketplace = transaksi yang terhubung ke satu pelanggan terdaftar
   */
  customerType?: 'walk_in' | 'marketplace';
  page: number;
  limit: number;
}

export async function listTransactions(
  filter: ListTransactionsFilter
): Promise<{ data: StoredTransaction[]; total: number }> {
  // Urutan penyimpanan ikut dibawa: dua transaksi bisa punya created_at
  // yang sama persis (checkout beruntun dalam milidetik yang sama), dan
  // tanpa penentu kedua urutannya jadi tidak menentu antar halaman.
  const matched = transactions
    .map((transaction, urutanSimpan) => ({ transaction, urutanSimpan }))
    .filter(({ transaction: t }) => {
      const createdAt = new Date(t.created_at);
      if (filter.createdFrom && createdAt < filter.createdFrom) return false;
      if (filter.createdTo && createdAt > filter.createdTo) return false;
      if (filter.paymentMethod && t.payment_method !== filter.paymentMethod) return false;
      if (filter.customerType) {
        const punyaPelanggan = t.customer_id !== null;
        if (filter.customerType === 'marketplace' && !punyaPelanggan) return false;
        if (filter.customerType === 'walk_in' && punyaPelanggan) return false;
      }
      return true;
    });

  // Halaman Laporan dibaca dari yang paling baru.
  matched.sort(
    (a, b) =>
      b.transaction.created_at.localeCompare(a.transaction.created_at) ||
      b.urutanSimpan - a.urutanSimpan
  );

  const start = (filter.page - 1) * filter.limit;
  return {
    data: matched.slice(start, start + filter.limit).map((m) => m.transaction),
    total: matched.length,
  };
}

export interface CheckoutItemInput {
  product_id: string;
  product_name_snapshot: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface CheckoutInput {
  idempotency_key: string;
  request_fingerprint: string;
  type: TransactionType;
  customer_id: string | null;
  cashier_user_id: string;
  payment_method: PaymentMethod;
  subtotal: number;
  total_amount: number;
  amount_paid: number | null;
  change_amount: number | null;
  items: CheckoutItemInput[];
}

/**
 * Simpan transaksi + potong stok + catat penyesuaian stok, SEKALIGUS.
 *
 * Ini pengganti sementara dari "1 DB transaction" yang diminta SRS 9.1:
 * seluruh isi fungsi ini sengaja SINKRON (tidak ada satu pun `await` di
 * dalamnya), jadi tidak ada request lain yang bisa menyelip di tengah
 * dan melihat kondisi setengah jadi -- misal stok sudah kepotong tapi
 * transaksinya belum tercatat.
 *
 * Waktu pindah ke Postgres, isi fungsi ini yang dibungkus
 * prisma.$transaction() + SELECT ... FOR UPDATE pada baris products
 * (SRS 9.2). Pemanggilnya tidak perlu berubah.
 */
export async function commitCheckout(
  input: CheckoutInput
): Promise<{ transaction: StoredTransaction; adjustments: StockAdjustment[] }> {
  // Tahap 1: PERIKSA semuanya dulu, belum ada yang diubah. Kalau ada
  // satu saja yang tidak beres, kita berhenti sebelum sempat merusak
  // apa pun -- persis seperti transaksi database yang di-rollback.
  const rows = input.items.map((item) => {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) {
      throw notFound(`Produk ${item.product_id} tidak ditemukan.`);
    }
    if (product.stock_qty < item.qty) {
      throw conflict(
        `Stok "${product.name}" tinggal ${product.stock_qty}, tidak cukup untuk ${item.qty}.`
      );
    }
    return { product, item };
  });

  // Tahap 2: baru TULIS. Mulai dari sini tidak ada lagi yang bisa gagal.
  const now = new Date().toISOString();
  const transactionId = nextTransactionId();

  const transaction: StoredTransaction = {
    id: transactionId,
    idempotency_key: input.idempotency_key,
    request_fingerprint: input.request_fingerprint,
    type: input.type,
    customer_id: input.customer_id,
    cashier_user_id: input.cashier_user_id,
    payment_method: input.payment_method,
    subtotal: input.subtotal,
    total_amount: input.total_amount,
    amount_paid: input.amount_paid,
    change_amount: input.change_amount,
    status: 'completed',
    voided_at: null,
    voided_by: null,
    void_reason: null,
    synced_offline: false,
    items: input.items.map((item) => ({
      id: nextTransactionItemId(),
      product_id: item.product_id,
      product_name_snapshot: item.product_name_snapshot,
      qty: item.qty,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    })),
    created_at: now,
  };

  const adjustments: StockAdjustment[] = rows.map(({ product, item }) => {
    const stockBefore = product.stock_qty;
    product.stock_qty = stockBefore - item.qty;
    product.updated_at = now;

    const adjustment: StockAdjustment = {
      id: nextStockAdjustmentId(),
      product_id: product.id,
      change_qty: -item.qty,
      reason: 'sale',
      reference_type: 'transaction',
      reference_id: transactionId,
      stock_before: stockBefore,
      stock_after: product.stock_qty,
      adjusted_by_user_id: input.cashier_user_id,
      created_at: now,
    };
    stockAdjustments.push(adjustment);
    return adjustment;
  });

  transactions.push(transaction);

  return { transaction, adjustments };
}

/**
 * Ubah stok satu produk + catat alasannya di log, SEKALIGUS.
 *
 * Sama seperti commitCheckout: seluruh isi fungsi ini sengaja SINKRON
 * supaya stok dan log-nya tidak pernah terpisah -- stok tidak mungkin
 * berubah tanpa ada barisnya di stock_adjustments, dan sebaliknya.
 * Nanti dibungkus prisma.$transaction() (SRS 9.1).
 */
export async function commitStockAdjustment(input: {
  product_id: string;
  change_qty: number;
  reason: StockChangeReason;
  reference_type: 'transaction' | 'external_order' | 'manual' | null;
  reference_id: string | null;
  adjusted_by_user_id: string | null;
}): Promise<StockAdjustment> {
  const product = products.find((p) => p.id === input.product_id);
  if (!product) {
    throw notFound('Produk tidak ditemukan.');
  }

  const stockBefore = product.stock_qty;
  const stockAfter = stockBefore + input.change_qty;
  if (stockAfter < 0) {
    throw conflict(
      `Stok "${product.name}" tinggal ${stockBefore}, tidak bisa dikurangi ${Math.abs(input.change_qty)}.`
    );
  }

  const now = new Date().toISOString();
  product.stock_qty = stockAfter;
  product.updated_at = now;

  const adjustment: StockAdjustment = {
    id: nextStockAdjustmentId(),
    product_id: product.id,
    change_qty: input.change_qty,
    reason: input.reason,
    reference_type: input.reference_type,
    reference_id: input.reference_id,
    stock_before: stockBefore,
    stock_after: stockAfter,
    adjusted_by_user_id: input.adjusted_by_user_id,
    created_at: now,
  };
  stockAdjustments.push(adjustment);

  return adjustment;
}

/**
 * Batalkan transaksi + kembalikan stok tiap itemnya, SEKALIGUS.
 *
 * Sama seperti commitCheckout, seluruh isi fungsi ini sengaja SINKRON
 * supaya tidak ada kondisi setengah jadi -- transaksi tidak mungkin
 * berstatus "voided" tanpa stoknya ikut kembali, dan sebaliknya
 * (FR-FI-07, SRS 9.1).
 */
export async function commitVoid(input: {
  transaction_id: string;
  voided_by: string;
  void_reason: string | null;
}): Promise<{ transaction: StoredTransaction; adjustments: StockAdjustment[] }> {
  // Tahap 1: periksa dulu, belum ada yang diubah.
  const transaction = transactions.find((t) => t.id === input.transaction_id);
  if (!transaction) {
    throw notFound('Transaksi tidak ditemukan.');
  }
  if (transaction.status === 'voided') {
    // Kalau dibiarkan lewat, stoknya akan dikembalikan DUA kali dan
    // jumlah barang di sistem jadi lebih banyak dari yang sebenarnya.
    throw conflict('Transaksi ini sudah dibatalkan sebelumnya.');
  }

  const rows = transaction.items.map((item) => {
    const product = products.find((p) => p.id === item.product_id);
    if (!product) {
      // Produk tidak pernah dihapus lewat API (cuma dinonaktifkan), jadi
      // sampai sini artinya datanya memang bermasalah.
      throw notFound(`Produk ${item.product_id} pada transaksi ini tidak ditemukan.`);
    }
    return { product, item };
  });

  // Tahap 2: baru tulis.
  const now = new Date().toISOString();

  const adjustments: StockAdjustment[] = rows.map(({ product, item }) => {
    const stockBefore = product.stock_qty;
    product.stock_qty = stockBefore + item.qty;
    product.updated_at = now;

    const adjustment: StockAdjustment = {
      id: nextStockAdjustmentId(),
      product_id: product.id,
      change_qty: item.qty,
      reason: 'void_reversal',
      reference_type: 'transaction',
      reference_id: transaction.id,
      stock_before: stockBefore,
      stock_after: product.stock_qty,
      adjusted_by_user_id: input.voided_by,
      created_at: now,
    };
    stockAdjustments.push(adjustment);
    return adjustment;
  });

  transaction.status = 'voided';
  transaction.voided_at = now;
  transaction.voided_by = input.voided_by;
  transaction.void_reason = input.void_reason;

  return { transaction, adjustments };
}

/** Riwayat penyesuaian stok sebuah produk (buat audit/laporan). */
export async function listStockAdjustmentsByProduct(
  productId: string
): Promise<StockAdjustment[]> {
  return stockAdjustments.filter((a) => a.product_id === productId);
}
// ---------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------

export async function findTicketById(id: string): Promise<Ticket | null> {
  return tickets.find((t) => t.id === id) ?? null;
}

/** Dipakai buat memastikan satu order tidak dibuatkan ticket dua kali. */
export async function findTicketByExternalOrderId(
  externalOrderId: string
): Promise<Ticket | null> {
  return tickets.find((t) => t.external_order_id === externalOrderId) ?? null;
}

export async function createTicket(input: {
  external_order_id: string;
  assigned_to_user_id: string;
  assigned_by: string;
  notes: string | null;
  items: { product_id: string; product_name_snapshot: string; qty: number }[];
}): Promise<Ticket> {
  const now = new Date().toISOString();

  const ticket: Ticket = {
    id: nextTicketId(),
    external_order_id: input.external_order_id,
    assigned_to_user_id: input.assigned_to_user_id,
    // Dibuat sekaligus di-assign, jadi tidak pernah melewati `unassigned`.
    status: 'assigned',
    assigned_at: now,
    assigned_by: input.assigned_by,
    completed_at: null,
    notes: input.notes,
    items: input.items.map((item) => ({
      id: nextTicketItemId(),
      product_id: item.product_id,
      product_name_snapshot: item.product_name_snapshot,
      qty: item.qty,
      is_packed: false,
    })),
    created_at: now,
    updated_at: now,
  };

  tickets.push(ticket);
  return ticket;
}
