// backend/src/modules/sales-inventory/routes.ts

// Di sinilah alamat URL (endpoint) modul Sales & Inventory didaftarkan,
// sesuai contracts/api.yaml. File ini cuma "penerima tamu": terima
// request, cek bentuknya bener apa nggak (pakai zod), lempar ke
// service.ts buat diproses, lalu balikin hasilnya.

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as service from './service';
import { asyncHandler, badRequest } from '../../shared/errors';
import { requireAuth, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth';

export const router = Router();

// ---------- GET /api/categories ----------
// Semua role boleh baca: kasir butuh daftar kategori buat filter produk
// di layar POS, pengepak butuh buat lihat detail item.
router.get(
  '/categories',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const categories = await service.listCategories();
    // Sesuai contracts/api.yaml endpoint ini balikin array polos,
    // BUKAN dibungkus { data, page, limit, total } seperti /products.
    res.status(200).json(categories);
  })
);

// ---------- POST /api/categories ----------
const createCategorySchema = z.object({
  // .trim() dulu baru .min(1), supaya nama berisi spasi doang (" ")
  // ikut ditolak. max 150 mengikuti kolom name varchar(150) di
  // prisma/schema.prisma -- lebih baik ditolak di sini dengan pesan
  // jelas daripada nanti gagal di database.
  name: z.string().trim().min(1, 'Nama kategori wajib diisi').max(150, 'Nama kategori maksimal 150 karakter'),
});

router.post(
  '/categories',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createCategorySchema.parse(req.body);
    const category = await service.createCategory({
      name: body.name,
      createdByUserId: req.user!.id,
    });
    res.status(201).json(category);
  })
);

// =====================================================================
// Products
// =====================================================================

// Harga di DB disimpan sebagai decimal(14,2). Kalau frontend ngirim
// 15000.999, tanpa cek ini angkanya bakal dibulatkan diam-diam oleh
// database -- untuk data uang, lebih baik ditolak dengan pesan jelas.
const rupiah = z
  .number()
  .nonnegative('Harga tidak boleh minus')
  .max(999_999_999_999, 'Harga terlalu besar')
  .refine((v) => Number.isInteger(v * 100), 'Harga maksimal 2 angka di belakang koma');

const nama = z.string().trim().min(1, 'Nama produk wajib diisi').max(200, 'Nama produk maksimal 200 karakter');
const sku = z.string().trim().min(1).max(100, 'SKU maksimal 100 karakter');
const imageUrl = z.string().trim().max(500, 'URL gambar maksimal 500 karakter');
const unit = z.string().trim().min(1).max(30, 'Satuan maksimal 30 karakter');

// ---------- GET /api/products ----------
const listProductsSchema = z.object({
  // ?search= (kosong) diperlakukan sama dengan tidak mengirim search
  // sama sekali, bukan "cari string kosong".
  search: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  category_id: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  // Query string selalu berupa teks, jadi "true"/"false" diterjemahkan
  // sendiri ke boolean -- Boolean("false") itu true, jebakan klasik.
  is_active: z
    .enum(['true', 'false'], { errorMap: () => ({ message: 'is_active harus true atau false' }) })
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1, 'page minimal 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit minimal 1').max(100, 'limit maksimal 100').default(20),
});

router.get(
  '/products',
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = listProductsSchema.parse(req.query);
    const result = await service.listProducts({
      search: query.search,
      categoryId: query.category_id,
      isActive: query.is_active,
      page: query.page,
      limit: query.limit,
    });
    res.status(200).json(result);
  })
);

// ---------- POST /api/products ----------
const createProductSchema = z.object({
  name: nama,
  sku: sku.optional(),
  category_id: z.string().trim().min(1).optional(),
  price: rupiah,
  stock_qty: z.number().int('Stok harus bilangan bulat').nonnegative('Stok tidak boleh minus'),
  low_stock_threshold: z
    .number()
    .int('Batas stok minim harus bilangan bulat')
    .nonnegative('Batas stok minim tidak boleh minus')
    .default(5),
  image_url: imageUrl.optional(),
  unit: unit.optional(),
});

router.post(
  '/products',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createProductSchema.parse(req.body);
    const product = await service.createProduct({ ...body, createdByUserId: req.user!.id });
    res.status(201).json(product);
  })
);

// ---------- GET /api/products/:id ----------
router.get(
  '/products/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const product = await service.getProduct(req.params.id);
    res.status(200).json(product);
  })
);

// ---------- PATCH /api/products/:id ----------
// Semua field opsional (namanya juga PATCH), tapi minimal satu harus
// ada -- PATCH dengan body kosong hampir pasti bug di frontend.
// Yang boleh null artinya "kosongkan lagi", misal produk dilepas dari
// kategorinya.
const updateProductSchema = z
  .object({
    name: nama.optional(),
    sku: sku.nullable().optional(),
    category_id: z.string().trim().min(1).nullable().optional(),
    price: rupiah.optional(),
    low_stock_threshold: z
      .number()
      .int('Batas stok minim harus bilangan bulat')
      .nonnegative('Batas stok minim tidak boleh minus')
      .optional(),
    image_url: imageUrl.nullable().optional(),
    unit: unit.nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Tidak ada data yang diubah.');

router.patch(
  '/products/:id',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    // Stok sengaja tidak bisa diubah dari sini. Kalau diam-diam
    // diabaikan, owner bakal ngira stoknya udah kesimpan padahal tidak,
    // jadi lebih baik ditolak terang-terangan.
    if (req.body && typeof req.body === 'object' && 'stock_qty' in req.body) {
      throw badRequest(
        'Stok tidak bisa diubah lewat endpoint ini. Pakai POST /api/products/:id/stock-adjustments supaya perubahannya tercatat.'
      );
    }

    const body = updateProductSchema.parse(req.body);
    const product = await service.updateProduct(req.params.id, body);
    res.status(200).json(product);
  })
);

// ---------- POST /api/products/:id/stock-adjustments ----------
// Satu-satunya pintu untuk mengubah stok di luar checkout. Sengaja
// begitu: setiap perubahan stok harus meninggalkan jejak siapa, kapan,
// dan kenapa (FR-SI-09).
const stockAdjustmentSchema = z.object({
  change_qty: z
    .number()
    .int('change_qty harus bilangan bulat')
    .refine((v) => v !== 0, 'change_qty tidak boleh 0')
    .refine((v) => Math.abs(v) <= 1_000_000, 'change_qty terlalu besar'),
  reason: z.enum(['manual_adjustment', 'restock'], {
    errorMap: () => ({ message: 'reason harus manual_adjustment atau restock' }),
  }),
});

router.post(
  '/products/:id/stock-adjustments',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = stockAdjustmentSchema.parse(req.body);

    const adjustment = await service.adjustStock({
      productId: req.params.id,
      changeQty: body.change_qty,
      reason: body.reason,
      userId: req.user!.id,
    });

    res.status(201).json(adjustment);
  })
);

// =====================================================================
// Import produk massal
// =====================================================================

/** Batas ukuran file. Sengaja kecil: 5 MB itu sudah puluhan ribu baris. */
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

// Cuma .xlsx. Format .xls lawas (Excel 97-2003) TIDAK didukung karena
// library pembacanya yang masih terawat tidak bisa baca format itu, dan
// yang bisa punya celah keamanan yang belum ditambal di npm. User cukup
// buka filenya di Excel lalu "Save As" .xlsx.
const ALLOWED_EXTENSIONS = ['.xlsx'];

const uploadImportFile = multer({
  // Disimpan di memori, tidak nulis file ke disk server. Aman karena
  // ukurannya dibatasi 5 MB di atas.
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      // File .xls lawas paling sering ketemu, jadi kasih pesan khusus.
      const saran =
        ext === '.xls'
          ? ' Buka filenya di Excel lalu simpan ulang sebagai .xlsx.'
          : '';
      return cb(badRequest(`Format file harus .xlsx.${saran}`));
    }
    cb(null, true);
  },
});

/**
 * Multer melempar MulterError yang bentuknya beda dari error kita, dan
 * kalau dibiarkan bakal jadi 500 padahal ini salah pengirim request.
 * Jadi diterjemahkan dulu di sini sebelum diteruskan ke error handler
 * pusat di app.ts.
 */
function terimaFileImport(req: Request, res: Response, next: NextFunction): void {
  uploadImportFile.single('file')(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(badRequest('Ukuran file maksimal 5 MB.'));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(badRequest('Kirim filenya di field bernama "file".'));
      }
      return next(badRequest(`File tidak bisa diproses: ${err.message}`));
    }

    next(err);
  });
}

// ---------- POST /api/products/import ----------
// Didaftarkan SETELAH POST /products, tapi tidak bentrok dengan
// GET/PATCH /products/:id karena method-nya beda.
router.post(
  '/products/import',
  requireAuth,
  requireRole('owner'),
  terimaFileImport,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      throw badRequest('File belum dipilih. Kirim file .xlsx di field bernama "file".');
    }

    const job = await service.startProductImport({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      userId: req.user!.id,
    });

    // 202 = "diterima, tapi belum selesai dikerjakan". Frontend pantau
    // hasilnya lewat GET /products/import/:job_id.
    res.status(202).json({ job_id: job.id, status: job.status });
  })
);

// ---------- GET /api/products/import/:jobId ----------
// CATATAN: endpoint ini BELUM ada di contracts/api.yaml. Tanpa ini
// job_id dari endpoint di atas tidak ada gunanya -- frontend tidak punya
// cara tahu importnya sudah selesai atau belum. Perlu ditambahkan ke
// kontrak waktu review tim.
router.get(
  '/products/import/:jobId',
  requireAuth,
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const job = await service.getImportJob(req.params.jobId);
    res.status(200).json({
      job_id: job.id,
      status: job.status,
      filename: job.filename,
      total_rows: job.total_rows,
      created: job.created_count,
      updated: job.updated_count,
      failed: job.failed_count,
      errors: job.errors,
      warnings: job.warnings,
      message: job.message,
      created_at: job.created_at,
      finished_at: job.finished_at,
    });
  })
);

// =====================================================================
// Transactions (checkout)
// =====================================================================

// ---------- POST /api/transactions ----------

// Header Idempotency-Key WAJIB (contracts/api.yaml + SRS 9.3). Ini yang
// bikin kasir aman menekan "Bayar" dua kali waktu sinyal jelek: request
// kedua dengan key yang sama mengembalikan transaksi yang sudah ada,
// bukan bikin transaksi (dan potongan stok) baru.
const idempotencyKeySchema = z
  .string({ required_error: 'Header Idempotency-Key wajib diisi.' })
  .uuid('Header Idempotency-Key harus berupa UUID.');

const checkoutSchema = z
  .object({
    type: z.enum(['walk_in', 'pre_order'], {
      errorMap: () => ({ message: 'type harus walk_in atau pre_order' }),
    }),
    customer_id: z.string().trim().min(1).nullable().optional(),
    payment_method: z.enum(['cash', 'transfer', 'ewallet'], {
      errorMap: () => ({ message: 'payment_method harus cash, transfer, atau ewallet' }),
    }),
    amount_paid: z
      .number()
      .nonnegative('amount_paid tidak boleh minus')
      .max(999_999_999_999, 'amount_paid terlalu besar')
      .refine((v) => Number.isInteger(v * 100), 'amount_paid maksimal 2 angka di belakang koma')
      .nullable()
      .optional(),
    items: z
      .array(
        z.object({
          product_id: z.string().trim().min(1, 'product_id wajib diisi'),
          qty: z.number().int('qty harus bilangan bulat').min(1, 'qty minimal 1'),
        })
      )
      .min(1, 'Transaksi harus berisi minimal 1 item'),
  })
  .superRefine((body, ctx) => {
    const adaAmountPaid = body.amount_paid !== undefined && body.amount_paid !== null;

    if (body.payment_method === 'cash' && !adaAmountPaid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount_paid'],
        message: 'wajib diisi untuk pembayaran tunai',
      });
    }

    // Transfer & e-wallet nominalnya selalu pas, tidak ada kembalian.
    // Kalau tetap dikirim, kemungkinan besar frontend salah pilih metode
    // -- lebih baik ditolak daripada uangnya tercatat salah.
    if (body.payment_method !== 'cash' && adaAmountPaid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount_paid'],
        message: 'hanya dipakai untuk pembayaran tunai',
      });
    }
  });

router.post(
  '/transactions',
  requireAuth,
  // Pengepak tidak melayani pembayaran, jadi tidak boleh checkout.
  requireRole('owner', 'kasir'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const idempotencyKey = idempotencyKeySchema.parse(req.header('Idempotency-Key'));
    const body = checkoutSchema.parse(req.body);

    const transaction = await service.checkout({
      idempotencyKey,
      type: body.type,
      customer_id: body.customer_id ?? null,
      payment_method: body.payment_method,
      amount_paid: body.amount_paid ?? null,
      items: body.items,
      cashierUserId: req.user!.id,
    });

    res.status(201).json(transaction);
  })
);

// ---------- GET /api/transactions ----------

const tanggal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'tanggal harus format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'tanggal tidak valid');

const listTransactionsSchema = z
  .object({
    date_from: tanggal.optional(),
    date_to: tanggal.optional(),
    payment_method: z
      .enum(['cash', 'transfer', 'ewallet'], {
        errorMap: () => ({ message: 'payment_method harus cash, transfer, atau ewallet' }),
      })
      .optional(),
    customer_type: z
      .enum(['walk_in', 'marketplace'], {
        errorMap: () => ({ message: 'customer_type harus walk_in atau marketplace' }),
      })
      .optional(),
    page: z.coerce.number().int().min(1, 'page minimal 1').default(1),
    limit: z.coerce.number().int().min(1, 'limit minimal 1').max(100, 'limit maksimal 100').default(20),
  })
  .refine(
    (q) => !q.date_from || !q.date_to || q.date_from <= q.date_to,
    // Rentang terbalik hampir pasti salah isi form; kalau didiamkan
    // hasilnya kosong dan user mengira datanya hilang.
    { path: ['date_to'], message: 'date_to tidak boleh lebih awal dari date_from' }
  );

/**
 * "2026-08-31" jadi rentang satu hari penuh menurut jam SERVER.
 *
 * new Date("2026-08-31") sendirian dibaca sebagai tengah malam UTC, jadi
 * di server WIB (UTC+7) transaksi jam 6 pagi masuk hitungan hari
 * sebelumnya. Karena itu tanggalnya dirakit per komponen.
 *
 * CATATAN: server WAJIB dijalankan pada zona waktu toko (mis. TZ=
 * Asia/Jakarta), karena di database maupun kontrak belum ada kolom zona
 * waktu toko. Perlu diangkat ke tim kalau nanti ada cabang beda zona.
 */
function awalHari(isoDate: string): Date {
  const [tahun, bulan, hari] = isoDate.split('-').map(Number);
  return new Date(tahun, bulan - 1, hari, 0, 0, 0, 0);
}

function akhirHari(isoDate: string): Date {
  const [tahun, bulan, hari] = isoDate.split('-').map(Number);
  return new Date(tahun, bulan - 1, hari, 23, 59, 59, 999);
}

router.get(
  '/transactions',
  requireAuth,
  requireRole('owner', 'kasir'),
  asyncHandler(async (req, res) => {
    const query = listTransactionsSchema.parse(req.query);

    const result = await service.listTransactions({
      createdFrom: query.date_from ? awalHari(query.date_from) : undefined,
      createdTo: query.date_to ? akhirHari(query.date_to) : undefined,
      paymentMethod: query.payment_method,
      customerType: query.customer_type,
      page: query.page,
      limit: query.limit,
    });

    res.status(200).json(result);
  })
);

// ---------- GET /api/transactions/:id ----------
// Sumber data struk: item, harga saat itu, total, dan kembalian semua
// sudah tersimpan di transaksinya, jadi struk lama tetap sama walau
// harga produknya sudah berubah.
router.get(
  '/transactions/:id',
  requireAuth,
  requireRole('owner', 'kasir'),
  asyncHandler(async (req, res) => {
    const transaction = await service.getTransaction(req.params.id);
    res.status(200).json(transaction);
  })
);

// ---------- PATCH /api/transactions/:id/void ----------
// Body-nya opsional (contracts/api.yaml), jadi request tanpa body pun
// diterima -- alasannya sekadar tidak tercatat.
const voidTransactionSchema = z.object({
  void_reason: z
    .string()
    .trim()
    .max(500, 'void_reason maksimal 500 karakter')
    // Alasan berisi spasi doang sama saja dengan tidak diisi.
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

router.patch(
  '/transactions/:id/void',
  requireAuth,
  // Membatalkan transaksi menghapus penjualan dari laporan sekaligus
  // mengembalikan stok, jadi ditahan di Owner.
  requireRole('owner'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = voidTransactionSchema.parse(req.body ?? {});

    const transaction = await service.voidTransaction({
      transactionId: req.params.id,
      voidedBy: req.user!.id,
      voidReason: body.void_reason ?? null,
    });

    res.status(200).json(transaction);
  })
);
// =====================================================================
// Tickets (fulfillment)
// =====================================================================

// ---------- POST /api/tickets ----------
const createTicketSchema = z.object({
  external_order_id: z.string().trim().min(1, 'external_order_id wajib diisi'),
  assigned_to_user_id: z.string().trim().min(1, 'assigned_to_user_id wajib diisi'),
  notes: z
    .string()
    .trim()
    .max(1000, 'notes maksimal 1000 karakter')
    // Catatan berisi spasi doang sama saja dengan tidak diisi.
    .transform((v) => v || null)
    .nullable()
    .optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().trim().min(1, 'product_id wajib diisi'),
        qty: z.number().int('qty harus bilangan bulat').min(1, 'qty minimal 1'),
      })
    )
    .min(1, 'Ticket harus berisi minimal 1 item'),
});

router.post(
  '/tickets',
  requireAuth,
  // Menentukan siapa yang mengerjakan order adalah keputusan Owner.
  requireRole('owner'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createTicketSchema.parse(req.body);

    const ticket = await service.createTicket({
      externalOrderId: body.external_order_id,
      assignedToUserId: body.assigned_to_user_id,
      notes: body.notes ?? null,
      items: body.items,
      assignedByUserId: req.user!.id,
    });

    res.status(201).json(ticket);
  })
);

// ---------- GET /api/tickets/my ----------
// WAJIB didaftarkan SEBELUM route '/tickets/:id' apa pun (belum ada
// sekarang, tapi kontrak sudah menyiapkan /tickets/{id}/assign dkk).
// Kalau terbalik, Express akan menganggap "my" sebagai id ticket.
router.get(
  '/tickets/my',
  requireAuth,
  requireRole('pengepak'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const tickets = await service.listMyTickets(req.user!.id);
    res.status(200).json(tickets);
  })
);

// ---------- GET /api/tickets ----------
const listTicketsSchema = z.object({
  status: z
    .enum(['unassigned', 'assigned', 'packing', 'packed', 'handed_over'], {
      errorMap: () => ({
        message: 'status harus salah satu dari: unassigned, assigned, packing, packed, handed_over',
      }),
    })
    .optional(),
  page: z.coerce.number().int().min(1, 'page minimal 1').default(1),
  limit: z.coerce.number().int().min(1, 'limit minimal 1').max(100, 'limit maksimal 100').default(20),
});

router.get(
  '/tickets',
  requireAuth,
  // Papan pantau seluruh antrean packing -- ini layar Owner.
  requireRole('owner'),
  asyncHandler(async (req, res) => {
    const query = listTicketsSchema.parse(req.query);

    const tickets = await service.listTickets({
      status: query.status,
      page: query.page,
      limit: query.limit,
    });

    // Sesuai contracts/api.yaml endpoint ini membalas array polos, BUKAN
    // dibungkus { data, page, limit, total } seperti /products.
    res.status(200).json(tickets);
  })
);

// ---------- PATCH /api/tickets/:id/assign ----------
const assignTicketSchema = z.object({
  assigned_to_user_id: z.string().trim().min(1, 'assigned_to_user_id wajib diisi'),
});

router.patch(
  '/tickets/:id/assign',
  requireAuth,
  // Menentukan siapa yang mengerjakan order adalah keputusan Owner.
  requireRole('owner'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = assignTicketSchema.parse(req.body);

    const ticket = await service.assignTicket({
      ticketId: req.params.id,
      assignedToUserId: body.assigned_to_user_id,
      assignedByUserId: req.user!.id,
    });

    res.status(200).json(ticket);
  })
);

// ---------- PATCH /api/tickets/:id/status ----------
// Dua-duanya opsional (bisa cuma mencentang item, bisa cuma ganti
// status), tapi minimal salah satu harus ada -- PATCH kosong hampir
// pasti bug di frontend.
const updateTicketStatusSchema = z
  .object({
    status: z
      .enum(['unassigned', 'assigned', 'packing', 'packed', 'handed_over'], {
        errorMap: () => ({
          message:
            'status harus salah satu dari: unassigned, assigned, packing, packed, handed_over',
        }),
      })
      .optional(),
    ticket_items: z
      .array(
        z.object({
          id: z.string().trim().min(1, 'id item wajib diisi'),
          is_packed: z.boolean({
            required_error: 'is_packed wajib diisi',
            invalid_type_error: 'is_packed harus true atau false',
          }),
        })
      )
      .min(1, 'ticket_items tidak boleh kosong')
      .optional(),
  })
  .refine(
    (body) => body.status !== undefined || body.ticket_items !== undefined,
    'Tidak ada yang diubah: isi status, ticket_items, atau dua-duanya.'
  );

router.patch(
  '/tickets/:id/status',
  requireAuth,
  // Pengepak yang mengerjakan; Owner ikut boleh buat membereskan kalau
  // stafnya berhalangan. Batas "cuma ticket sendiri" untuk pengepak
  // ditegakkan di service, karena butuh data ticketnya.
  requireRole('owner', 'pengepak'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = updateTicketStatusSchema.parse(req.body);

    const ticket = await service.updateTicketProgress({
      ticketId: req.params.id,
      status: body.status,
      items: body.ticket_items,
      actor: req.user!,
    });

    res.status(200).json(ticket);
  })
);
