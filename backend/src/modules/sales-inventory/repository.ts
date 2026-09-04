// backend/src/modules/sales-inventory/repository.ts

// SATU-SATUNYA tempat modul ini menyentuh database. service.ts tidak
// boleh memanggil prisma langsung -- semua lewat fungsi di sini, supaya
// aturan main (service) dan cara menyimpan (sini) tidak saling terikat.
//
// Kenapa Prisma, bukan pool pg seperti auth-product? Karena tabel-tabel
// modul ini saling terhubung (transactions -> transaction_items,
// tickets -> ticket_items) dan tiga operasinya WAJIB atomik
// (commitCheckout, commitVoid, commitStockAdjustment). prisma.$transaction()
// + nested write menangani keduanya sekaligus, dan modul ecommerce-sync
// sudah pakai pola yang sama.
//
// Dua hal yang selalu diterjemahkan sebelum data keluar dari file ini:
//   - Decimal (kolom uang) -> number biasa
//   - Date (kolom waktu)   -> string ISO
// Supaya bentuk yang dilihat service.ts sama persis dengan waktu datanya
// masih di memori, dan sama dengan contracts/api.yaml.

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/db';
import { StockChangeReason } from '../../shared/event-bus';
import { badRequest, conflict, notFound } from '../../shared/errors';
import { ImportJob, importJobs, nextImportJobId } from './internal/store';

// ---------------------------------------------------------------------
// Bentuk data yang dipakai modul ini
//
// Didefinisikan di sini (bukan di internal/store.ts seperti dulu) karena
// sekarang file inilah yang tahu bentuk barisnya -- pola yang sama dengan
// auth-product/repository.ts yang mengekspor tipe User.
// ---------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

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

export type TransactionType = 'walk_in' | 'pre_order';
export type PaymentMethod = 'cash' | 'transfer' | 'ewallet';
export type TransactionStatus = 'completed' | 'voided';

export interface TransactionItem {
  id: string;
  product_id: string;
  /** Nama produk DIBEKUKAN saat transaksi terjadi, supaya struk lama
   *  tetap kebaca apa adanya kalau produknya diganti nama. */
  product_name_snapshot: string;
  qty: number;
  /** Harga satuan saat itu, juga dibekukan. */
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

export type TicketStatus = 'unassigned' | 'assigned' | 'packing' | 'packed' | 'handed_over';

export interface TicketItem {
  id: string;
  product_id: string;
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

// ---------------------------------------------------------------------
// Penerjemah baris database -> bentuk di atas
// ---------------------------------------------------------------------

/** Kolom uang di Postgres bertipe DECIMAL; Prisma mengembalikannya
 *  sebagai Decimal, bukan number. Struk dan laporan butuh number. */
function uang(nilai: Prisma.Decimal): number {
  return nilai.toNumber();
}

function uangOpsional(nilai: Prisma.Decimal | null): number | null {
  return nilai === null ? null : nilai.toNumber();
}

function waktu(nilai: Date): string {
  return nilai.toISOString();
}

function waktuOpsional(nilai: Date | null): string | null {
  return nilai === null ? null : nilai.toISOString();
}

/**
 * Semua kolom `id` di modul ini bertipe UUID. Kalau dikirimi teks yang
 * bukan UUID (mis. /api/products/produk-hantu), Postgres MENOLAK dengan
 * error tipe -- yang akan muncul sebagai 500, padahal maksud sebenarnya
 * cuma "tidak ada barisnya". Jadi id yang bentuknya jelas tidak mungkin
 * ada disaring lebih dulu di sini dan diperlakukan sebagai tidak ketemu.
 */
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bukanUuid(id: string): boolean {
  return !POLA_UUID.test(id);
}

type BarisKategori = Prisma.categoriesGetPayload<object>;
type BarisProduk = Prisma.productsGetPayload<object>;
type BarisPenyesuaian = Prisma.stock_adjustmentsGetPayload<object>;
type BarisTransaksi = Prisma.transactionsGetPayload<{ include: { transaction_items: true } }>;
type BarisTicket = Prisma.ticketsGetPayload<{ include: { ticket_items: true } }>;

function keCategory(baris: BarisKategori): Category {
  return {
    id: baris.id,
    name: baris.name,
    created_by: baris.created_by,
    created_at: waktu(baris.created_at),
  };
}

function keProduct(baris: BarisProduk): Product {
  return {
    id: baris.id,
    category_id: baris.category_id,
    name: baris.name,
    sku: baris.sku,
    price: uang(baris.price),
    cost_price: uangOpsional(baris.cost_price),
    stock_qty: baris.stock_qty,
    low_stock_threshold: baris.low_stock_threshold,
    image_url: baris.image_url,
    unit: baris.unit,
    is_active: baris.is_active,
    created_by: baris.created_by,
    created_at: waktu(baris.created_at),
    updated_at: waktu(baris.updated_at),
  };
}

function kePenyesuaian(baris: BarisPenyesuaian): StockAdjustment {
  return {
    id: baris.id,
    product_id: baris.product_id,
    change_qty: baris.change_qty,
    reason: baris.reason as StockChangeReason,
    reference_type: baris.reference_type as StockAdjustment['reference_type'],
    reference_id: baris.reference_id,
    stock_before: baris.stock_before,
    stock_after: baris.stock_after,
    adjusted_by_user_id: baris.adjusted_by_user_id,
    created_at: waktu(baris.created_at),
  };
}

function keTransaction(baris: BarisTransaksi): Transaction {
  return {
    id: baris.id,
    idempotency_key: baris.idempotency_key,
    type: baris.type as TransactionType,
    customer_id: baris.customer_id,
    cashier_user_id: baris.cashier_user_id,
    payment_method: baris.payment_method as PaymentMethod,
    subtotal: uang(baris.subtotal),
    total_amount: uang(baris.total_amount),
    amount_paid: uangOpsional(baris.amount_paid),
    change_amount: uangOpsional(baris.change_amount),
    status: baris.status as TransactionStatus,
    voided_at: waktuOpsional(baris.voided_at),
    voided_by: baris.voided_by,
    void_reason: baris.void_reason,
    synced_offline: baris.synced_offline,
    // Urutan item dikunci ke created_at lalu id supaya struk yang
    // dicetak ulang tidak pernah berbeda urutannya dari yang pertama.
    items: [...baris.transaction_items]
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id.localeCompare(b.id))
      .map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name_snapshot: item.product_name_snapshot,
        qty: item.qty,
        unit_price: uang(item.unit_price),
        subtotal: uang(item.subtotal),
      })),
    created_at: waktu(baris.created_at),
  };
}

function keTicket(baris: BarisTicket): Ticket {
  return {
    id: baris.id,
    external_order_id: baris.external_order_id,
    assigned_to_user_id: baris.assigned_to_user_id,
    status: baris.status as TicketStatus,
    assigned_at: waktuOpsional(baris.assigned_at),
    assigned_by: baris.assigned_by,
    completed_at: waktuOpsional(baris.completed_at),
    notes: baris.notes,
    items: [...baris.ticket_items]
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id.localeCompare(b.id))
      .map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name_snapshot: item.product_name_snapshot,
        qty: item.qty,
        is_packed: item.is_packed,
      })),
    created_at: waktu(baris.created_at),
    updated_at: waktu(baris.updated_at),
  };
}

// ---------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  // Urut A-Z biar dropdown kategori di frontend gampang dibaca.
  const baris = await prisma.categories.findMany({ orderBy: { name: 'asc' } });
  return baris.map(keCategory);
}

export async function findCategoryById(id: string): Promise<Category | null> {
  if (bukanUuid(id)) return null;
  const baris = await prisma.categories.findUnique({ where: { id } });
  return baris ? keCategory(baris) : null;
}

/**
 * Cari kategori berdasarkan nama, TANPA membedakan huruf besar/kecil.
 * Dipakai buat cek duplikat: "Minuman" dan "minuman" dianggap sama,
 * karena di DB kolom name-nya unique dan user tidak akan paham kenapa
 * boleh ada dua kategori yang kelihatannya identik.
 */
export async function findCategoryByName(name: string): Promise<Category | null> {
  const baris = await prisma.categories.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  return baris ? keCategory(baris) : null;
}

export async function createCategory(input: {
  name: string;
  created_by: string | null;
}): Promise<Category> {
  const baris = await prisma.categories.create({
    data: { name: input.name, created_by: input.created_by },
  });
  return keCategory(baris);
}

/** Ambil beberapa kategori sekaligus, buat kebutuhan JOIN di service. */
export async function findCategoriesByIds(ids: string[]): Promise<Category[]> {
  const idValid = ids.filter((id) => !bukanUuid(id));
  if (idValid.length === 0) return [];
  const baris = await prisma.categories.findMany({ where: { id: { in: idValid } } });
  return baris.map(keCategory);
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

/** id yang pasti tidak ada, buat memaksa hasil kosong tanpa error tipe. */
const UUID_MUSTAHIL = '00000000-0000-0000-0000-000000000000';

/**
 * Cari produk dengan filter + pagination.
 *
 * `total` dihitung dari hasil filter SEBELUM dipotong per halaman --
 * frontend butuh angka itu buat nampilin "menampilkan 20 dari 137".
 */
export async function listProducts(
  filter: ListProductsFilter
): Promise<{ data: Product[]; total: number }> {
  const where: Prisma.productsWhereInput = {};

  if (filter.categoryId) {
    where.category_id = bukanUuid(filter.categoryId) ? UUID_MUSTAHIL : filter.categoryId;
  }
  if (filter.isActive !== undefined) {
    where.is_active = filter.isActive;
  }
  if (filter.search) {
    // Kasir biasanya ngetik sebagian nama, atau scan/ketik SKU.
    where.OR = [
      { name: { contains: filter.search, mode: 'insensitive' } },
      { sku: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  // Dihitung dan diambil dalam satu transaksi baca supaya `total` dan
  // isi halaman berasal dari kondisi tabel yang sama.
  const [baris, total] = await prisma.$transaction([
    prisma.products.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.products.count({ where }),
  ]);

  return { data: baris.map(keProduct), total };
}

export async function findProductById(id: string): Promise<Product | null> {
  if (bukanUuid(id)) return null;
  const baris = await prisma.products.findUnique({ where: { id } });
  return baris ? keProduct(baris) : null;
}

/**
 * Cari produk berdasarkan SKU (case-insensitive). Dipakai buat cek
 * duplikat, karena di DB kolom sku-nya unique.
 */
export async function findProductBySku(sku: string): Promise<Product | null> {
  const baris = await prisma.products.findFirst({
    where: { sku: { equals: sku, mode: 'insensitive' } },
  });
  return baris ? keProduct(baris) : null;
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
  const baris = await prisma.products.create({
    data: {
      name: input.name,
      sku: input.sku,
      category_id: input.category_id,
      price: new Prisma.Decimal(input.price),
      stock_qty: input.stock_qty,
      low_stock_threshold: input.low_stock_threshold,
      image_url: input.image_url,
      unit: input.unit,
      created_by: input.created_by,
    },
  });
  return keProduct(baris);
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
  if (bukanUuid(id)) return null;

  const data: Prisma.productsUncheckedUpdateInput = {
    // Kolom updated_at cuma punya DEFAULT (berlaku saat INSERT), tidak
    // ada trigger ON UPDATE -- jadi harus diisi sendiri di sini.
    updated_at: new Date(),
  };
  if (changes.name !== undefined) data.name = changes.name;
  if (changes.sku !== undefined) data.sku = changes.sku;
  if (changes.category_id !== undefined) data.category_id = changes.category_id;
  if (changes.price !== undefined) data.price = new Prisma.Decimal(changes.price);
  if (changes.low_stock_threshold !== undefined) {
    data.low_stock_threshold = changes.low_stock_threshold;
  }
  if (changes.image_url !== undefined) data.image_url = changes.image_url;
  if (changes.unit !== undefined) data.unit = changes.unit;
  if (changes.is_active !== undefined) data.is_active = changes.is_active;

  try {
    const baris = await prisma.products.update({ where: { id }, data });
    return keProduct(baris);
  } catch (err) {
    // P2025 = baris yang mau diubah tidak ada. Pemanggil menerjemahkan
    // null ini jadi 404.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------
// Transactions (checkout)
// ---------------------------------------------------------------------

export async function findTransactionByIdempotencyKey(key: string): Promise<Transaction | null> {
  const baris = await prisma.transactions.findUnique({
    where: { idempotency_key: key },
    include: { transaction_items: true },
  });
  return baris ? keTransaction(baris) : null;
}

export async function findTransactionById(id: string): Promise<Transaction | null> {
  if (bukanUuid(id)) return null;
  const baris = await prisma.transactions.findUnique({
    where: { id },
    include: { transaction_items: true },
  });
  return baris ? keTransaction(baris) : null;
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
): Promise<{ data: Transaction[]; total: number }> {
  const where: Prisma.transactionsWhereInput = {};

  if (filter.createdFrom || filter.createdTo) {
    where.created_at = {
      ...(filter.createdFrom ? { gte: filter.createdFrom } : {}),
      ...(filter.createdTo ? { lte: filter.createdTo } : {}),
    };
  }
  if (filter.paymentMethod) {
    where.payment_method = filter.paymentMethod;
  }
  if (filter.customerType) {
    where.customer_id = filter.customerType === 'marketplace' ? { not: null } : null;
  }

  const [baris, total] = await prisma.$transaction([
    prisma.transactions.findMany({
      where,
      include: { transaction_items: true },
      // Halaman Laporan dibaca dari yang paling baru. `id` jadi penentu
      // kedua: dua checkout beruntun bisa punya created_at yang sama
      // persis, dan tanpa itu urutannya tidak menentu antar halaman.
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.transactions.count({ where }),
  ]);

  return { data: baris.map(keTransaction), total };
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

/** Baris produk yang sudah dikunci di dalam sebuah transaksi database. */
interface ProdukTerkunci {
  id: string;
  name: string;
  stock_qty: number;
}

/**
 * Kunci baris produk yang mau diubah stoknya (SELECT ... FOR UPDATE),
 * supaya dua checkout atas barang yang sama tidak saling menimpa
 * (SRS 9.2).
 *
 * Dikunci berurutan menurut id: kalau dua transaksi mengunci beberapa
 * produk yang sama tapi dengan urutan berbeda, keduanya bisa saling
 * menunggu selamanya (deadlock). Urutan yang sama untuk semua pemanggil
 * menghilangkan kemungkinan itu.
 */
async function kunciProduk(
  tx: Prisma.TransactionClient,
  productIds: string[]
): Promise<Map<string, ProdukTerkunci>> {
  const idUnik = [...new Set(productIds)].filter((id) => !bukanUuid(id)).sort();
  if (idUnik.length === 0) return new Map();

  const baris = await tx.$queryRaw<ProdukTerkunci[]>`
    SELECT id, name, stock_qty
    FROM products
    WHERE id = ANY(${idUnik}::uuid[])
    ORDER BY id
    FOR UPDATE
  `;

  return new Map(baris.map((p) => [p.id, p]));
}

/**
 * Simpan transaksi + potong stok + catat penyesuaian stok, SEKALIGUS
 * dalam satu transaksi database (SRS 9.1).
 *
 * Baris produknya dikunci lebih dulu, jadi stok yang dibaca untuk
 * pengecekan dijamin masih sama waktu dipotong -- tidak ada request lain
 * yang bisa menyelip di antaranya. Kalau ada satu saja yang gagal,
 * seluruhnya dibatalkan: stok tidak mungkin kepotong tanpa transaksinya
 * tercatat, dan sebaliknya.
 */
export async function commitCheckout(
  input: CheckoutInput
): Promise<{ transaction: Transaction; adjustments: StockAdjustment[] }> {
  return prisma.$transaction(async (tx) => {
    // Tahap 1: kunci + PERIKSA semuanya dulu, belum ada yang diubah.
    const terkunci = await kunciProduk(
      tx,
      input.items.map((i) => i.product_id)
    );

    const baris = input.items.map((item) => {
      const product = terkunci.get(item.product_id);
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

    // Tahap 2: baru TULIS.
    const now = new Date();

    const transaksi = await tx.transactions.create({
      data: {
        idempotency_key: input.idempotency_key,
        type: input.type,
        customer_id: input.customer_id,
        cashier_user_id: input.cashier_user_id,
        payment_method: input.payment_method,
        subtotal: new Prisma.Decimal(input.subtotal),
        total_amount: new Prisma.Decimal(input.total_amount),
        amount_paid: input.amount_paid === null ? null : new Prisma.Decimal(input.amount_paid),
        change_amount:
          input.change_amount === null ? null : new Prisma.Decimal(input.change_amount),
        status: 'completed',
        created_at: now,
        transaction_items: {
          create: input.items.map((item) => ({
            product_id: item.product_id,
            product_name_snapshot: item.product_name_snapshot,
            qty: item.qty,
            unit_price: new Prisma.Decimal(item.unit_price),
            subtotal: new Prisma.Decimal(item.subtotal),
            created_at: now,
          })),
        },
      },
      include: { transaction_items: true },
    });

    const adjustments: StockAdjustment[] = [];
    for (const { product, item } of baris) {
      const stockBefore = product.stock_qty;
      const stockAfter = stockBefore - item.qty;

      await tx.products.update({
        where: { id: product.id },
        data: { stock_qty: stockAfter, updated_at: now },
      });

      const penyesuaian = await tx.stock_adjustments.create({
        data: {
          product_id: product.id,
          change_qty: -item.qty,
          reason: 'sale',
          reference_type: 'transaction',
          reference_id: transaksi.id,
          stock_before: stockBefore,
          stock_after: stockAfter,
          adjusted_by_user_id: input.cashier_user_id,
          created_at: now,
        },
      });
      adjustments.push(kePenyesuaian(penyesuaian));
    }

    return { transaction: keTransaction(transaksi), adjustments };
  });
}

/**
 * Ubah stok satu produk + catat alasannya di log, SEKALIGUS.
 *
 * Sama seperti commitCheckout: satu transaksi database, baris produknya
 * dikunci dulu. Stok tidak mungkin berubah tanpa ada barisnya di
 * stock_adjustments, dan sebaliknya.
 */
export async function commitStockAdjustment(input: {
  product_id: string;
  change_qty: number;
  reason: StockChangeReason;
  reference_type: 'transaction' | 'external_order' | 'manual' | null;
  reference_id: string | null;
  adjusted_by_user_id: string | null;
}): Promise<StockAdjustment> {
  if (bukanUuid(input.product_id)) {
    throw notFound('Produk tidak ditemukan.');
  }

  return prisma.$transaction(async (tx) => {
    const terkunci = await kunciProduk(tx, [input.product_id]);
    const product = terkunci.get(input.product_id);
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

    const now = new Date();
    await tx.products.update({
      where: { id: product.id },
      data: { stock_qty: stockAfter, updated_at: now },
    });

    const penyesuaian = await tx.stock_adjustments.create({
      data: {
        product_id: product.id,
        change_qty: input.change_qty,
        reason: input.reason,
        reference_type: input.reference_type,
        reference_id: input.reference_id,
        stock_before: stockBefore,
        stock_after: stockAfter,
        adjusted_by_user_id: input.adjusted_by_user_id,
        created_at: now,
      },
    });

    return kePenyesuaian(penyesuaian);
  });
}

/**
 * Batalkan transaksi + kembalikan stok tiap itemnya, SEKALIGUS
 * (FR-FI-07, SRS 9.1).
 *
 * Transaksinya ikut dikunci, jadi dua pembatalan atas transaksi yang
 * sama tidak bisa dua-duanya lolos dan mengembalikan stok dua kali.
 */
export async function commitVoid(input: {
  transaction_id: string;
  voided_by: string;
  void_reason: string | null;
}): Promise<{ transaction: Transaction; adjustments: StockAdjustment[] }> {
  if (bukanUuid(input.transaction_id)) {
    throw notFound('Transaksi tidak ditemukan.');
  }

  return prisma.$transaction(async (tx) => {
    // Tahap 1: kunci transaksinya, LALU periksa. Kunci diambil sebelum
    // status dibaca -- kalau dibaca dulu baru dikunci, dua pembatalan
    // barengan bisa sama-sama sempat melihat status 'completed'.
    const terkunciTransaksi = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM transactions WHERE id = ${input.transaction_id}::uuid FOR UPDATE
    `;
    if (terkunciTransaksi.length === 0) {
      throw notFound('Transaksi tidak ditemukan.');
    }
    if (terkunciTransaksi[0].status === 'voided') {
      // Kalau dibiarkan lewat, stoknya akan dikembalikan DUA kali dan
      // jumlah barang di sistem jadi lebih banyak dari yang sebenarnya.
      throw conflict('Transaksi ini sudah dibatalkan sebelumnya.');
    }

    const items = await tx.transaction_items.findMany({
      where: { transaction_id: input.transaction_id },
    });

    const terkunciProduk = await kunciProduk(
      tx,
      items.map((i) => i.product_id)
    );

    const baris = items.map((item) => {
      const product = terkunciProduk.get(item.product_id);
      if (!product) {
        // Produk tidak pernah dihapus lewat API (cuma dinonaktifkan), jadi
        // sampai sini artinya datanya memang bermasalah.
        throw notFound(`Produk ${item.product_id} pada transaksi ini tidak ditemukan.`);
      }
      return { product, item };
    });

    // Tahap 2: baru tulis.
    const now = new Date();

    const adjustments: StockAdjustment[] = [];
    for (const { product, item } of baris) {
      const stockBefore = product.stock_qty;
      const stockAfter = stockBefore + item.qty;

      await tx.products.update({
        where: { id: product.id },
        data: { stock_qty: stockAfter, updated_at: now },
      });

      const penyesuaian = await tx.stock_adjustments.create({
        data: {
          product_id: product.id,
          change_qty: item.qty,
          reason: 'void_reversal',
          reference_type: 'transaction',
          reference_id: input.transaction_id,
          stock_before: stockBefore,
          stock_after: stockAfter,
          adjusted_by_user_id: input.voided_by,
          created_at: now,
        },
      });
      adjustments.push(kePenyesuaian(penyesuaian));
    }

    const transaksi = await tx.transactions.update({
      where: { id: input.transaction_id },
      data: {
        status: 'voided',
        voided_at: now,
        voided_by: input.voided_by,
        void_reason: input.void_reason,
      },
      include: { transaction_items: true },
    });

    return { transaction: keTransaction(transaksi), adjustments };
  });
}

/** Riwayat penyesuaian stok sebuah produk (buat audit/laporan). */
export async function listStockAdjustmentsByProduct(
  productId: string
): Promise<StockAdjustment[]> {
  if (bukanUuid(productId)) return [];
  const baris = await prisma.stock_adjustments.findMany({
    where: { product_id: productId },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });
  return baris.map(kePenyesuaian);
}

// ---------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------

export async function findTicketById(id: string): Promise<Ticket | null> {
  if (bukanUuid(id)) return null;
  const baris = await prisma.tickets.findUnique({
    where: { id },
    include: { ticket_items: true },
  });
  return baris ? keTicket(baris) : null;
}

/** Dipakai buat memastikan satu order tidak dibuatkan ticket dua kali. */
export async function findTicketByExternalOrderId(
  externalOrderId: string
): Promise<Ticket | null> {
  if (bukanUuid(externalOrderId)) return null;
  const baris = await prisma.tickets.findFirst({
    where: { external_order_id: externalOrderId },
    include: { ticket_items: true },
  });
  return baris ? keTicket(baris) : null;
}

export interface ListTicketsFilter {
  status?: TicketStatus;
  assignedToUserId?: string;
  /** Kalau `limit` tidak diisi, semua hasil dikembalikan tanpa dipotong. */
  page?: number;
  limit?: number;
}

/**
 * Cari ticket dengan filter penerima dan/atau status.
 *
 * Kombinasi filternya sengaja (assigned_to_user_id, status) -- persis
 * index `idx_tickets_assignee_status` di prisma/schema.prisma.
 */
export async function listTickets(filter: ListTicketsFilter): Promise<Ticket[]> {
  const where: Prisma.ticketsWhereInput = {};
  if (filter.status) where.status = filter.status;
  if (filter.assignedToUserId) {
    // Penerima yang id-nya bukan UUID tidak mungkin punya ticket.
    if (bukanUuid(filter.assignedToUserId)) return [];
    where.assigned_to_user_id = filter.assignedToUserId;
  }

  const baris = await prisma.tickets.findMany({
    where,
    include: { ticket_items: true },
    // Ini antrean kerja, bukan laporan: yang paling lama menunggu muncul
    // duluan supaya order lama tidak keburu lewat batas waktu kirim.
    // `id` jadi penentu kedua supaya urutannya tetap sama antar halaman.
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    ...(filter.limit === undefined
      ? {}
      : { skip: ((filter.page ?? 1) - 1) * filter.limit, take: filter.limit }),
  });

  return baris.map(keTicket);
}

export async function createTicket(input: {
  external_order_id: string;
  assigned_to_user_id: string;
  assigned_by: string;
  notes: string | null;
  items: { product_id: string; product_name_snapshot: string; qty: number }[];
}): Promise<Ticket> {
  const now = new Date();

  const baris = await prisma.tickets.create({
    data: {
      external_order_id: input.external_order_id,
      assigned_to_user_id: input.assigned_to_user_id,
      // Dibuat sekaligus di-assign, jadi tidak pernah melewati `unassigned`.
      status: 'assigned',
      assigned_at: now,
      assigned_by: input.assigned_by,
      notes: input.notes,
      created_at: now,
      updated_at: now,
      ticket_items: {
        create: input.items.map((item) => ({
          product_id: item.product_id,
          product_name_snapshot: item.product_name_snapshot,
          qty: item.qty,
          is_packed: false,
          created_at: now,
        })),
      },
    },
    include: { ticket_items: true },
  });

  return keTicket(baris);
}

/**
 * Pindahkan ticket ke pengepak lain (atau isi penerima yang tadinya
 * kosong). Statusnya ikut jadi `assigned` karena sekarang sudah jelas
 * siapa yang mengerjakan.
 */
export async function assignTicket(input: {
  ticket_id: string;
  assigned_to_user_id: string;
  assigned_by: string;
}): Promise<Ticket> {
  if (bukanUuid(input.ticket_id)) {
    throw notFound('Ticket tidak ditemukan.');
  }

  const now = new Date();
  try {
    const baris = await prisma.tickets.update({
      where: { id: input.ticket_id },
      data: {
        assigned_to_user_id: input.assigned_to_user_id,
        assigned_by: input.assigned_by,
        assigned_at: now,
        status: 'assigned',
        updated_at: now,
      },
      include: { ticket_items: true },
    });
    return keTicket(baris);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw notFound('Ticket tidak ditemukan.');
    }
    throw err;
  }
}

/** Status terakhir dalam alur -- ticket yang sudah sampai sini selesai. */
const TICKET_STATUS_TERMINAL: TicketStatus = 'handed_over';

/**
 * Update status ticket dan/atau centang checklist item-nya sekaligus.
 *
 * Satu transaksi database dengan ticket-nya dikunci lebih dulu: kalau
 * ada satu id item yang salah, tidak ada satu pun centang yang
 * terlanjur tersimpan.
 *
 * `baruSajaSelesai` = ticket ini BARU saja lengkap centangnya di request
 * ini (sebelumnya belum). Dipakai pemanggil buat memutuskan perlu tidaknya
 * mengabari modul lain -- dikembalikan dari sini karena cuma di dalam
 * transaksi ini keadaan "sebelum" dan "sesudah" bisa dibandingkan tanpa
 * disela request lain.
 */
export async function updateTicketProgress(input: {
  ticket_id: string;
  status?: TicketStatus;
  items?: { id: string; is_packed: boolean }[];
}): Promise<{ ticket: Ticket; baruSajaSelesai: boolean }> {
  if (bukanUuid(input.ticket_id)) {
    throw notFound('Ticket tidak ditemukan.');
  }

  return prisma.$transaction(async (tx) => {
    // Tahap 1: kunci + periksa, belum ada yang diubah.
    const terkunci = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM tickets WHERE id = ${input.ticket_id}::uuid FOR UPDATE
    `;
    if (terkunci.length === 0) {
      throw notFound('Ticket tidak ditemukan.');
    }
    if (terkunci[0].status === TICKET_STATUS_TERMINAL) {
      throw conflict('Ticket ini sudah diserahkan dan tidak bisa diubah lagi.');
    }

    const itemSekarang = await tx.ticket_items.findMany({
      where: { ticket_id: input.ticket_id },
    });

    const perubahanItem = (input.items ?? []).map((perubahan) => {
      const item = itemSekarang.find((i) => i.id === perubahan.id);
      if (!item) {
        throw badRequest(`Item ${perubahan.id} bukan bagian dari ticket ini.`);
      }
      return { item, is_packed: perubahan.is_packed };
    });

    const semuaSelesaiSebelum = itemSekarang.every((i) => i.is_packed);

    // Tahap 2: baru tulis.
    const now = new Date();
    for (const { item, is_packed } of perubahanItem) {
      await tx.ticket_items.update({ where: { id: item.id }, data: { is_packed } });
    }

    const dataTicket: Prisma.ticketsUncheckedUpdateInput = { updated_at: now };
    if (input.status) {
      dataTicket.status = input.status;
      // Ticket dianggap tuntas saat barangnya benar-benar diserahkan.
      if (input.status === TICKET_STATUS_TERMINAL) {
        dataTicket.completed_at = now;
      }
    }

    const baris = await tx.tickets.update({
      where: { id: input.ticket_id },
      data: dataTicket,
      include: { ticket_items: true },
    });

    const ticket = keTicket(baris);
    const semuaSelesaiSesudah = ticket.items.every((i) => i.is_packed);

    return { ticket, baruSajaSelesai: !semuaSelesaiSebelum && semuaSelesaiSesudah };
  });
}

// ---------------------------------------------------------------------
// Import jobs
//
// Satu-satunya yang TIDAK di database. Alasannya panjang dan ada di
// internal/store.ts -- singkatnya: pemrosesannya jalan di dalam proses
// ini (setImmediate), jadi baris di database malah akan nyangkut di
// status `processing` selamanya kalau prosesnya mati di tengah jalan.
//
// Tetap lewat file ini supaya aturannya tidak berlubang: service.ts
// mengakses SEMUA penyimpanan lewat repository, tidak peduli yang di
// balik layar itu Postgres atau array.
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
