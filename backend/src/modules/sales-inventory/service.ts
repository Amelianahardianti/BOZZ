// backend/src/modules/sales-inventory/service.ts

// File ini isinya "aturan main" modul Sales & Inventory -- misalnya
// nama kategori tidak boleh dobel. routes.ts manggil fungsi-fungsi di
// sini, bukan ngurus logic-nya sendiri.
//
// Error dilempar pakai helper dari shared/errors.ts; bentuk JSON-nya
// dirakit di error handler pusat (app.ts), bukan di sini.

import { createHash } from 'crypto';
import { z, ZodError } from 'zod';
import * as repo from './repository';
import { AppError, badRequest, conflict, notFound } from '../../shared/errors';
import { EVENTS, publish } from '../../shared/event-bus';
import {
  Category,
  ImportJob,
  ImportJobRowNote,
  PaymentMethod,
  Product,
  StockAdjustment,
  StoredTransaction,
  Ticket,
  Transaction,
  TransactionType,
} from './internal/store';
import { parseProductWorkbook, RawImportRow } from './internal/product-import';
// Modul lain hanya boleh diakses lewat index.ts-nya, bukan file dalamnya.
import { findActiveUser } from '../auth-product';

// ---------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  return repo.listCategories();
}

export async function createCategory(input: {
  name: string;
  createdByUserId: string | null;
}): Promise<Category> {
  // Rapikan spasi dulu: " Minuman  Dingin " -> "Minuman Dingin".
  // Kalau tidak, user bisa bikin dua kategori yang kelihatan sama persis
  // tapi lolos cek duplikat cuma gara-gara beda spasi.
  const name = input.name.trim().replace(/\s+/g, ' ');

  const existing = await repo.findCategoryByName(name);
  if (existing) {
    throw conflict(`Kategori "${existing.name}" sudah ada.`);
  }

  return repo.createCategory({
    name,
    created_by: input.createdByUserId,
  });
}

// ---------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------

// Yang dikirim ke frontend = kolom produk + nama kategorinya (hasil
// JOIN), sesuai schema Product di contracts/api.yaml.
export type ProductResponse = Product & { category_name: string | null };

/**
 * Tempelkan nama kategori ke sekumpulan produk. Kategorinya diambil
 * sekali borongan, bukan satu-satu per produk -- pola ini yang nanti
 * bikin versi database-nya tidak kena N+1 query.
 */
async function withCategoryNames(items: Product[]): Promise<ProductResponse[]> {
  const ids = [...new Set(items.map((p) => p.category_id).filter((id): id is string => !!id))];
  const found = ids.length ? await repo.findCategoriesByIds(ids) : [];
  const nameById = new Map(found.map((c) => [c.id, c.name]));

  return items.map((p) => ({
    ...p,
    category_name: p.category_id ? nameById.get(p.category_id) ?? null : null,
  }));
}

/** Pastikan category_id yang dikirim user memang ada isinya. */
async function assertCategoryExists(categoryId: string): Promise<void> {
  const category = await repo.findCategoryById(categoryId);
  if (!category) {
    throw badRequest('Kategori yang dipilih tidak ditemukan.');
  }
}

/**
 * Pastikan SKU belum dipakai produk lain. `exceptProductId` dipakai saat
 * update, supaya produk tidak dianggap bentrok dengan dirinya sendiri.
 */
async function assertSkuAvailable(sku: string, exceptProductId?: string): Promise<void> {
  const existing = await repo.findProductBySku(sku);
  if (existing && existing.id !== exceptProductId) {
    throw conflict(`SKU "${existing.sku}" sudah dipakai produk "${existing.name}".`);
  }
}

export async function listProducts(filter: {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}): Promise<{ data: ProductResponse[]; page: number; limit: number; total: number }> {
  const { data, total } = await repo.listProducts(filter);

  return {
    data: await withCategoryNames(data),
    page: filter.page,
    limit: filter.limit,
    total,
  };
}

export async function getProduct(id: string): Promise<ProductResponse> {
  const product = await repo.findProductById(id);
  if (!product) {
    throw notFound('Produk tidak ditemukan.');
  }
  const [withName] = await withCategoryNames([product]);
  return withName;
}

export async function createProduct(input: {
  name: string;
  sku?: string;
  category_id?: string;
  price: number;
  stock_qty: number;
  low_stock_threshold: number;
  image_url?: string;
  unit?: string;
  createdByUserId: string | null;
}): Promise<ProductResponse> {
  if (input.category_id) {
    await assertCategoryExists(input.category_id);
  }
  if (input.sku) {
    await assertSkuAvailable(input.sku);
  }

  const created = await repo.createProduct({
    name: input.name,
    sku: input.sku ?? null,
    category_id: input.category_id ?? null,
    price: input.price,
    stock_qty: input.stock_qty,
    low_stock_threshold: input.low_stock_threshold,
    image_url: input.image_url ?? null,
    unit: input.unit ?? null,
    created_by: input.createdByUserId,
  });

  const [withName] = await withCategoryNames([created]);
  return withName;
}

export async function updateProduct(
  id: string,
  changes: {
    name?: string;
    sku?: string | null;
    category_id?: string | null;
    price?: number;
    low_stock_threshold?: number;
    image_url?: string | null;
    unit?: string | null;
    is_active?: boolean;
  }
): Promise<ProductResponse> {
  const product = await repo.findProductById(id);
  if (!product) {
    throw notFound('Produk tidak ditemukan.');
  }

  if (changes.category_id) {
    await assertCategoryExists(changes.category_id);
  }
  if (changes.sku) {
    await assertSkuAvailable(changes.sku, id);
  }

  const updated = await repo.updateProduct(id, changes);
  const [withName] = await withCategoryNames([updated!]);
  return withName;
}

// ---------------------------------------------------------------------
// Import produk massal (POST /products/import)
// ---------------------------------------------------------------------

/**
 * Batas jumlah catatan error/warning yang disimpan per job. File 5000
 * baris yang formatnya kacau semua tidak ada gunanya dilaporkan satu per
 * satu -- 200 contoh pertama sudah cukup buat tahu apa yang salah, dan
 * angka `failed_count` tetap dihitung lengkap.
 */
const MAX_TRACKED_NOTES = 200;

/** Angka di Excel kadang ketulis sebagai teks: "Rp 15000", " 12 ". */
function angkaDariSel(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const bersih = value.replace(/^rp/i, '').replace(/\s/g, '');
  return bersih === '' ? undefined : Number(bersih);
}

const angkaWajib = (schema: z.ZodTypeAny) => z.preprocess(angkaDariSel, schema);

// Aturan per baris file. Sengaja lebih longgar dari POST /products:
// stok dan batas stok minim boleh kosong (nanti dikasih default), karena
// file dari supplier jarang selengkap form di aplikasi.
const importRowSchema = z.object({
  name: z.string().trim().min(1, 'nama produk wajib diisi').max(200, 'nama produk maksimal 200 karakter'),
  sku: z.string().trim().max(100, 'SKU maksimal 100 karakter').optional(),
  category: z.string().trim().max(150).optional(),
  price: angkaWajib(
    z
      .number({ invalid_type_error: 'harga harus berupa angka' })
      .nonnegative('harga tidak boleh minus')
      .max(999_999_999_999, 'harga terlalu besar')
      .refine((v) => Number.isInteger(v * 100), 'harga maksimal 2 angka di belakang koma')
  ),
  stock_qty: angkaWajib(
    z
      .number({ invalid_type_error: 'stok harus berupa angka' })
      .int('stok harus bilangan bulat')
      .nonnegative('stok tidak boleh minus')
      .optional()
  ),
  low_stock_threshold: angkaWajib(
    z
      .number({ invalid_type_error: 'batas stok minim harus berupa angka' })
      .int('batas stok minim harus bilangan bulat')
      .nonnegative('batas stok minim tidak boleh minus')
      .optional()
  ),
  unit: z.string().trim().max(30, 'satuan maksimal 30 karakter').optional(),
  image_url: z.string().trim().max(500, 'URL gambar maksimal 500 karakter').optional(),
});

/**
 * Ubah error apa pun jadi satu kalimat yang muat di kolom laporan.
 * Pesan zod digabung supaya user tahu SEMUA yang salah di baris itu,
 * bukan cuma yang pertama.
 */
function pesanError(err: unknown): string {
  if (err instanceof ZodError) {
    return err.errors.map((e) => `${e.path.join('.') || 'baris'}: ${e.message}`).join('; ');
  }
  if (err instanceof AppError) return err.message;
  return 'Baris gagal diproses karena kesalahan tak terduga.';
}

type RowOutcome = { kind: 'created' | 'updated'; warning?: string };

/**
 * Proses satu baris: produk dengan SKU yang sudah ada = update,
 * selain itu = bikin baru. Baris yang bermasalah dilempar errornya,
 * biar dicatat pemanggilnya dan baris berikutnya tetap jalan.
 */
async function applyImportRow(row: RawImportRow, userId: string | null): Promise<RowOutcome> {
  const input = importRowSchema.parse(row.values);

  // Kategori dicocokkan lewat NAMA, karena yang ditulis orang di Excel
  // pasti "Minuman", bukan uuid. Kategori yang belum ada TIDAK dibuat
  // otomatis -- salah ketik satu huruf di file bisa bikin kategori
  // sampah yang cuma bisa dibereskan manual.
  let categoryId: string | null = null;
  if (input.category) {
    const category = await repo.findCategoryByName(input.category);
    if (!category) {
      throw badRequest(`kategori "${input.category}" belum ada, tambahkan dulu lewat menu Kategori`);
    }
    categoryId = category.id;
  }

  const existing = input.sku ? await repo.findProductBySku(input.sku) : null;

  if (existing) {
    await repo.updateProduct(existing.id, {
      name: input.name,
      category_id: categoryId ?? existing.category_id,
      price: input.price,
      low_stock_threshold: input.low_stock_threshold ?? existing.low_stock_threshold,
      image_url: input.image_url ?? existing.image_url,
      unit: input.unit ?? existing.unit,
    });

    // Stok produk lama sengaja tidak ikut ditimpa: perubahan stok wajib
    // lewat stock-adjustments supaya ada jejaknya. Tapi kalau file-nya
    // memang beda, user harus DIBERI TAHU -- kalau didiamkan, dia kira
    // stoknya sudah kesimpan.
    const warning =
      input.stock_qty !== undefined && input.stock_qty !== existing.stock_qty
        ? `stok "${existing.name}" tidak diubah lewat import (tetap ${existing.stock_qty}). Pakai penyesuaian stok supaya perubahannya tercatat`
        : undefined;

    return { kind: 'updated', warning };
  }

  await repo.createProduct({
    name: input.name,
    sku: input.sku ?? null,
    category_id: categoryId,
    price: input.price,
    stock_qty: input.stock_qty ?? 0,
    low_stock_threshold: input.low_stock_threshold ?? 5,
    image_url: input.image_url ?? null,
    unit: input.unit ?? null,
    created_by: userId,
  });

  return { kind: 'created' };
}

/**
 * Kerja beratnya di sini. Dipanggil TANPA await oleh startProductImport,
 * jadi fungsi ini tidak boleh melempar apa pun -- semua kegagalan
 * dicatat ke job, bukan jadi unhandled rejection yang matiin proses.
 */
async function runImportJob(jobId: string, buffer: Buffer, userId: string | null): Promise<void> {
  const selesai = () => new Date().toISOString();

  try {
    await repo.updateImportJob(jobId, { status: 'processing' });

    // Error di tahap ini = masalah seluruh file, bukan satu baris.
    let rows: RawImportRow[];
    try {
      rows = await parseProductWorkbook(buffer);
    } catch (err) {
      await repo.updateImportJob(jobId, {
        status: 'failed',
        message: pesanError(err),
        finished_at: selesai(),
      });
      return;
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: ImportJobRowNote[] = [];
    const warnings: ImportJobRowNote[] = [];

    for (const row of rows) {
      try {
        const outcome = await applyImportRow(row, userId);
        if (outcome.kind === 'created') created += 1;
        else updated += 1;

        if (outcome.warning && warnings.length < MAX_TRACKED_NOTES) {
          warnings.push({ row: row.rowNumber, message: outcome.warning });
        }
      } catch (err) {
        // Satu baris jelek tidak boleh menggagalkan seluruh file --
        // yang bagus tetap masuk, yang jelek dilaporkan nomor barisnya.
        failed += 1;
        if (errors.length < MAX_TRACKED_NOTES) {
          errors.push({ row: row.rowNumber, message: pesanError(err) });
        }
      }
    }

    await repo.updateImportJob(jobId, {
      status: 'done',
      total_rows: rows.length,
      created_count: created,
      updated_count: updated,
      failed_count: failed,
      errors,
      warnings,
      finished_at: selesai(),
    });
  } catch (err) {
    // Sampai sini artinya ada bug di kode kita sendiri. Detail lengkapnya
    // ke log server, user cukup tahu importnya gagal.
    console.error(`[import] job ${jobId} gagal tak terduga`, err);
    await repo
      .updateImportJob(jobId, {
        status: 'failed',
        message: 'Import gagal karena kesalahan pada server.',
        finished_at: selesai(),
      })
      .catch(() => undefined);
  }
}

/**
 * Terima file, catat job-nya, lalu langsung balik supaya user tidak
 * nunggu (contracts/api.yaml: 202 + job_id).
 *
 * TODO (SRS 9.8/10.8): sekarang job-nya jalan di proses yang sama dan
 * disimpan di memori, jadi hilang kalau server restart dan tidak kebagi
 * kalau nanti servernya lebih dari satu. Pindahkan ke queue beneran
 * (mis. BullMQ) waktu infra-nya sudah siap.
 */
export async function startProductImport(input: {
  buffer: Buffer;
  filename: string;
  userId: string | null;
}): Promise<ImportJob> {
  const job = await repo.createImportJob({
    filename: input.filename,
    created_by: input.userId,
  });

  // Sengaja tidak di-await.
  setImmediate(() => {
    void runImportJob(job.id, input.buffer, input.userId);
  });

  return job;
}

export async function getImportJob(id: string): Promise<ImportJob> {
  const job = await repo.findImportJobById(id);
  if (!job) {
    throw notFound('Job import tidak ditemukan.');
  }
  return job;
}

// ---------------------------------------------------------------------
// Checkout transaksi (POST /transactions)
// ---------------------------------------------------------------------

/**
 * Antrean tulis stok: SEMUA yang mengubah stok (checkout dan penyesuaian
 * manual) lewat sini, dijalankan satu per satu.
 *
 * Kenapa perlu? Cek stok dan ubah stok itu dua langkah terpisah. Kalau
 * dua kasir menekan "Bayar" pada detik yang sama untuk barang terakhir,
 * keduanya bisa sama-sama lolos pengecekan lalu sama-sama memotong stok,
 * dan stok jadi minus. Hal yang sama berlaku buat Idempotency-Key:
 * dua request kembar bisa sama-sama merasa "belum ada transaksinya".
 *
 * Antreannya sengaja SATU untuk semua jenis penulisan stok. Kalau
 * checkout dan penyesuaian manual punya antrean sendiri-sendiri, mereka
 * tetap bisa jalan barengan dan saling menimpa hasil.
 *
 * Di Postgres nanti ini digantikan SELECT ... FOR UPDATE (SRS 9.2).
 * Sampai saat itu, antrean sederhana ini yang menjaga.
 */
let stockWriteQueue: Promise<unknown> = Promise.resolve();

function serializeStockWrite<T>(fn: () => Promise<T>): Promise<T> {
  // Sengaja pakai then(fn, fn): satu penulisan yang gagal tidak boleh
  // bikin antrean berikutnya ikut gagal.
  const run = stockWriteQueue.then(fn, fn);
  stockWriteQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Uang selalu dibulatkan ke 2 angka di belakang koma. Tanpa ini,
 * 0.1 + 0.2 di JavaScript jadi 0.30000000000000004 dan angka di struk
 * bisa meleset beberapa sen.
 */
function uang(nilai: number): number {
  return Math.round(nilai * 100) / 100;
}

/**
 * Sidik jari isi request, buat mendeteksi Idempotency-Key yang dipakai
 * ulang untuk isi yang berbeda. Item diurutkan dulu supaya urutan yang
 * berbeda tapi isinya sama tetap dianggap sama.
 */
function fingerprintRequest(input: CheckoutRequest): string {
  const normalized = JSON.stringify({
    type: input.type,
    customer_id: input.customer_id ?? null,
    payment_method: input.payment_method,
    amount_paid: input.amount_paid ?? null,
    items: [...input.items]
      .map((i) => ({ product_id: i.product_id, qty: i.qty }))
      .sort((a, b) => a.product_id.localeCompare(b.product_id)),
  });
  return createHash('sha256').update(normalized).digest('hex');
}

/** Buang field internal sebelum dikirim ke frontend. */
function toPublicTransaction(stored: StoredTransaction): Transaction {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { request_fingerprint: _fingerprint, ...publicTransaction } = stored;
  return publicTransaction;
}

/**
 * Gabungkan baris yang produknya sama. Kasir yang men-scan barang yang
 * sama dua kali mengirim dua baris; kalau tidak digabung, pengecekan
 * stok dilakukan per baris dan bisa lolos padahal totalnya melebihi stok.
 */
function gabungkanItemKembar(
  items: { product_id: string; qty: number }[]
): { product_id: string; qty: number }[] {
  const perProduk = new Map<string, number>();
  for (const item of items) {
    perProduk.set(item.product_id, (perProduk.get(item.product_id) ?? 0) + item.qty);
  }
  return [...perProduk].map(([product_id, qty]) => ({ product_id, qty }));
}

export interface CheckoutRequest {
  idempotencyKey: string;
  type: TransactionType;
  customer_id?: string | null;
  payment_method: PaymentMethod;
  amount_paid?: number | null;
  items: { product_id: string; qty: number }[];
  cashierUserId: string;
}

export async function checkout(input: CheckoutRequest): Promise<Transaction> {
  const fingerprint = fingerprintRequest(input);

  return serializeStockWrite(async () => {
    // --- 1. Request yang sama diulang? (SRS 9.3) -------------------
    // Jaringan di toko sering putus-nyambung; kasir menekan "Bayar"
    // dua kali atau PWA mengirim ulang saat online lagi. Yang kedua
    // TIDAK boleh jadi transaksi (dan potongan stok) kedua.
    const sebelumnya = await repo.findTransactionByIdempotencyKey(input.idempotencyKey);
    if (sebelumnya) {
      if (sebelumnya.request_fingerprint !== fingerprint) {
        // Key sama tapi isinya beda = bug di pengirim. Kalau kita
        // balikin transaksi lama, kasir dapat struk barang yang salah.
        throw conflict(
          'Idempotency-Key ini sudah dipakai untuk transaksi lain yang isinya berbeda. Pakai key baru.'
        );
      }
      return toPublicTransaction(sebelumnya);
    }

    // --- 2. Kumpulkan produk & harga saat ini ----------------------
    const items = gabungkanItemKembar(input.items);
    const baris = [];

    for (const item of items) {
      const product = await repo.findProductById(item.product_id);
      if (!product) {
        throw badRequest(`Produk ${item.product_id} tidak ditemukan.`);
      }
      if (!product.is_active) {
        throw badRequest(`Produk "${product.name}" sudah tidak aktif dan tidak bisa dijual.`);
      }
      if (product.stock_qty < item.qty) {
        throw conflict(
          `Stok "${product.name}" tinggal ${product.stock_qty}, tidak cukup untuk ${item.qty}.`
        );
      }

      baris.push({
        product_id: product.id,
        // Nama & harga dibekukan di sini, bukan diambil lagi nanti.
        product_name_snapshot: product.name,
        qty: item.qty,
        unit_price: product.price,
        subtotal: uang(product.price * item.qty),
      });
    }

    // --- 3. Hitung total & kembalian -------------------------------
    const subtotal = uang(baris.reduce((jumlah, b) => jumlah + b.subtotal, 0));
    // Belum ada diskon/pajak di kontrak, jadi total = subtotal. Kalau
    // nanti ada, potongannya dihitung di sini.
    const totalAmount = subtotal;

    let amountPaid: number | null = null;
    let changeAmount: number | null = null;

    if (input.payment_method === 'cash') {
      // Sudah dipastikan ada oleh validasi di routes, tapi dicek lagi
      // supaya service ini aman dipanggil dari mana pun.
      if (input.amount_paid === undefined || input.amount_paid === null) {
        throw badRequest('Pembayaran tunai wajib menyertakan amount_paid.');
      }
      amountPaid = uang(input.amount_paid);
      if (amountPaid < totalAmount) {
        throw badRequest(
          `Uang yang dibayarkan (${amountPaid}) kurang dari total belanja (${totalAmount}).`
        );
      }
      changeAmount = uang(amountPaid - totalAmount);
    }
    // Transfer & e-wallet: nominalnya pasti pas, tidak ada kembalian,
    // jadi amount_paid & change_amount dibiarkan null (sesuai kontrak).

    // --- 4. Simpan: transaksi + potong stok, sekaligus --------------
    const { transaction, adjustments } = await repo.commitCheckout({
      idempotency_key: input.idempotencyKey,
      request_fingerprint: fingerprint,
      type: input.type,
      customer_id: input.customer_id ?? null,
      cashier_user_id: input.cashierUserId,
      payment_method: input.payment_method,
      subtotal,
      total_amount: totalAmount,
      amount_paid: amountPaid,
      change_amount: changeAmount,
      items: baris,
    });

    // --- 5. Kabari modul lain (FR-SI-09) ---------------------------
    // Baru dipublikasikan SETELAH transaksinya benar-benar tersimpan.
    // Kalau dipublikasikan lebih awal lalu penyimpanan gagal, modul
    // ecommerce-sync sudah terlanjur mengabarkan stok yang salah ke
    // Shopee/Tokopedia. Listener yang error tidak menjatuhkan checkout
    // ini -- itu dijamin oleh event-bus.
    for (const adjustment of adjustments) {
      publish(EVENTS.STOCK_UPDATED, {
        product_id: adjustment.product_id,
        change_qty: adjustment.change_qty,
        stock_after: adjustment.stock_after,
        reason: adjustment.reason,
      });
    }

    return toPublicTransaction(transaction);
  });
}

// ---------------------------------------------------------------------
// Penyesuaian stok manual (POST /products/:id/stock-adjustments)
// ---------------------------------------------------------------------

/**
 * Alasan yang boleh dipakai lewat endpoint manual. Sisa nilai enum di
 * kontrak (`sale`, `void_reversal`, `external_order`) sengaja TIDAK
 * diterima: itu dicatat sendiri oleh checkout, pembatalan, dan sinkron
 * marketplace. Kalau boleh diketik manual, angka laporan penjualan bisa
 * dikarang dari sini.
 */
export type ManualStockReason = 'manual_adjustment' | 'restock';

export const MANUAL_STOCK_REASONS: readonly ManualStockReason[] = [
  'manual_adjustment',
  'restock',
];

export async function adjustStock(input: {
  productId: string;
  changeQty: number;
  reason: ManualStockReason;
  userId: string | null;
}): Promise<StockAdjustment> {
  // Ikut antrean yang sama dengan checkout. Kalau punya antrean sendiri,
  // penyesuaian stok dan checkout bisa jalan barengan dan salah satunya
  // menimpa hasil yang lain (lost update).
  return serializeStockWrite(async () => {
    const adjustment = await repo.commitStockAdjustment({
      product_id: input.productId,
      change_qty: input.changeQty,
      reason: input.reason,
      // Penyesuaian manual tidak merujuk transaksi/order mana pun.
      reference_type: 'manual',
      reference_id: null,
      adjusted_by_user_id: input.userId,
    });

    // Dipublikasikan setelah tercatat, supaya stok yang dikabarkan ke
    // marketplace tidak pernah mendahului stok yang sebenarnya (FR-SI-09).
    publish(EVENTS.STOCK_UPDATED, {
      product_id: adjustment.product_id,
      change_qty: adjustment.change_qty,
      stock_after: adjustment.stock_after,
      reason: adjustment.reason,
    });

    return adjustment;
  });
}

// ---------------------------------------------------------------------
// Laporan transaksi (GET /transactions, GET /transactions/:id)
// ---------------------------------------------------------------------

export async function listTransactions(filter: {
  createdFrom?: Date;
  createdTo?: Date;
  paymentMethod?: PaymentMethod;
  customerType?: 'walk_in' | 'marketplace';
  page: number;
  limit: number;
}): Promise<{ data: Transaction[]; page: number; limit: number; total: number }> {
  const { data, total } = await repo.listTransactions(filter);

  return {
    data: data.map(toPublicTransaction),
    page: filter.page,
    limit: filter.limit,
    total,
  };
}

/**
 * Batalkan transaksi dan kembalikan stoknya (FR-FI-07).
 *
 * Uangnya sendiri dikembalikan di luar sistem (kasir menyerahkan tunai);
 * yang dicatat di sini status transaksinya dan pengembalian stok, supaya
 * laporan penjualan dan jumlah barang ikut terkoreksi.
 */
export async function voidTransaction(input: {
  transactionId: string;
  voidedBy: string;
  voidReason: string | null;
}): Promise<Transaction> {
  // Ikut antrean tulis stok yang sama dengan checkout dan penyesuaian
  // manual: pembatalan juga mengubah stok, dan dua pembatalan atas
  // transaksi yang sama tidak boleh jalan barengan.
  return serializeStockWrite(async () => {
    const { transaction, adjustments } = await repo.commitVoid({
      transaction_id: input.transactionId,
      voided_by: input.voidedBy,
      void_reason: input.voidReason,
    });

    // Setelah tercatat, baru marketplace dikabari stoknya nambah lagi.
    for (const adjustment of adjustments) {
      publish(EVENTS.STOCK_UPDATED, {
        product_id: adjustment.product_id,
        change_qty: adjustment.change_qty,
        stock_after: adjustment.stock_after,
        reason: adjustment.reason,
      });
    }

    return toPublicTransaction(transaction);
  });
}

/** Dipakai halaman detail & cetak ulang struk. */
export async function getTransaction(id: string): Promise<Transaction> {
  const transaction = await repo.findTransactionById(id);
  if (!transaction) {
    throw notFound('Transaksi tidak ditemukan.');
  }
  return toPublicTransaction(transaction);
}
// ---------------------------------------------------------------------
// Ticket packing (POST /tickets)
// ---------------------------------------------------------------------

export async function createTicket(input: {
  externalOrderId: string;
  assignedToUserId: string;
  notes: string | null;
  items: { product_id: string; qty: number }[];
  assignedByUserId: string;
}): Promise<Ticket> {
  // Satu order cukup satu ticket. Kalau boleh dobel, dua pengepak bisa
  // mengerjakan order yang sama dan barangnya terkirim dua kali.
  const sudahAda = await repo.findTicketByExternalOrderId(input.externalOrderId);
  if (sudahAda) {
    throw conflict(`Order ini sudah punya ticket packing (${sudahAda.id}).`);
  }

  // Ticket packing hanya boleh dipegang Pengepak. Data akun dipegang
  // modul auth-product, jadi ditanyakan lewat pintu resminya (index.ts),
  // bukan dengan mengintip internal-nya.
  const penerima = await findActiveUser(input.assignedToUserId);
  if (!penerima) {
    throw badRequest('Staf yang dipilih tidak ditemukan atau sudah nonaktif.');
  }
  if (penerima.role !== 'pengepak') {
    throw badRequest(
      `Ticket packing hanya bisa diberikan ke Pengepak, sedangkan "${penerima.name}" adalah ${penerima.role}.`
    );
  }

  const items = [];
  // Dua baris untuk produk yang sama digabung, supaya daftar packing
  // tidak menyuruh pengepak mengambil barang yang sama dua kali.
  for (const item of gabungkanItemKembar(input.items)) {
    const product = await repo.findProductById(item.product_id);
    if (!product) {
      throw badRequest(`Produk ${item.product_id} tidak ditemukan.`);
    }
    // Produk nonaktif TIDAK ditolak: ordernya sudah terlanjur masuk
    // sebelum produknya dinonaktifkan, barangnya tetap harus dipacking.
    items.push({
      product_id: product.id,
      product_name_snapshot: product.name,
      qty: item.qty,
    });
  }

  return repo.createTicket({
    external_order_id: input.externalOrderId,
    assigned_to_user_id: penerima.id,
    assigned_by: input.assignedByUserId,
    notes: input.notes,
    items,
  });
}
