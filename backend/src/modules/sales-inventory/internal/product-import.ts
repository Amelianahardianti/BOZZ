// backend/src/modules/sales-inventory/internal/product-import.ts

// Semua urusan "baca file Excel" dikurung di file ini. service.ts cuma
// terima hasilnya berupa baris-baris polos (Record<string, string>),
// jadi dia tidak perlu tahu apa-apa soal ExcelJS.
//
// CATATAN FORMAT: yang didukung .xlsx (dan .csv yang disimpan sebagai
// xlsx). File .xls lawas (Excel 97-2003) TIDAK didukung -- lihat
// alasannya di ALLOWED_EXTENSIONS di routes.ts. Kalau nanti .xls perlu
// didukung, cukup file ini yang diganti.

import ExcelJS from 'exceljs';
import { badRequest } from '../../../shared/errors';

/** Batas jumlah baris per file, biar satu import tidak bikin server macet. */
export const MAX_IMPORT_ROWS = 5000;

/** Satu baris data dari file, sudah jadi teks biasa. */
export interface RawImportRow {
  /** Nomor baris di file Excel (ikut header), supaya pesan error nyambung
   *  dengan yang dilihat user di layar Excel-nya. */
  rowNumber: number;
  values: Record<string, string>;
}

/**
 * Nama kolom yang dikenali, dalam Bahasa Indonesia maupun Inggris.
 * Pemilik toko bikin filenya sendiri, jadi jangan maksa satu ejaan.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'nama', 'nama produk', 'product name', 'produk'],
  sku: ['sku', 'kode', 'kode produk', 'barcode'],
  category: ['category', 'kategori', 'category name', 'nama kategori'],
  price: ['price', 'harga', 'harga jual'],
  stock_qty: ['stock qty', 'stock', 'stok', 'stok awal', 'qty', 'jumlah'],
  low_stock_threshold: [
    'low stock threshold',
    'batas stok minim',
    'stok minim',
    'stok minimum',
    'minimum stok',
    'min stok',
  ],
  unit: ['unit', 'satuan'],
  image_url: ['image url', 'gambar', 'url gambar', 'foto'],
};

/**
 * Samakan bentuk tulisan header sebelum dicocokkan: "Nama_Produk",
 * "nama produk", dan "  NAMA   PRODUK " harus dianggap sama.
 */
function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

const FIELD_BY_HEADER = new Map<string, string>();
for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
  for (const alias of aliases) {
    FIELD_BY_HEADER.set(normalizeHeader(alias), field);
  }
}

/**
 * Ubah isi sel jadi teks biasa. ExcelJS tidak selalu mengembalikan
 * string: sel bisa berisi angka, tanggal, rumus, hyperlink, atau teks
 * berwarna-warni (rich text) yang bentuknya object.
 */
function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    // Sel rumus: yang dipakai hasil hitungnya, bukan rumusnya.
    if ('result' in obj) return cellToText(obj.result as ExcelJS.CellValue);
    // Teks berwarna/campuran format: gabungkan potongan-potongannya.
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return (obj.richText as { text: string }[]).map((part) => part.text).join('');
    }
    // Hyperlink: ambil teks yang kelihatan.
    if ('text' in obj) return cellToText(obj.text as ExcelJS.CellValue);
    if ('error' in obj) return '';
    return '';
  }
  return String(value).trim();
}

/**
 * Baca file Excel jadi daftar baris. Yang dilempar dari sini adalah
 * error tingkat FILE (file rusak, header salah, kebanyakan baris) --
 * bukan error per baris; itu urusan service.ts.
 */
export async function parseProductWorkbook(buffer: Buffer): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook();

  try {
    // Cast-nya perlu karena tipe Buffer bawaan exceljs ketinggalan dari
    // @types/node yang sekarang; isinya sama-sama Buffer Node.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw badRequest('File tidak bisa dibaca. Pastikan filenya benar-benar .xlsx dan tidak rusak.');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw badRequest('File Excel-nya kosong, tidak ada sheet yang bisa dibaca.');
  }

  // Baris pertama yang ada isinya dianggap header.
  const headerRow = sheet.getRow(1);
  const fieldByColumn = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const field = FIELD_BY_HEADER.get(normalizeHeader(cellToText(cell.value)));
    if (field) fieldByColumn.set(colNumber, field);
  });

  if (!fieldByColumn.size) {
    throw badRequest(
      'Kolom di file tidak dikenali. Baris pertama harus berisi judul kolom, minimal: nama, harga.'
    );
  }
  // Tanpa dua kolom ini tidak ada produk yang bisa dibuat, jadi lebih
  // baik ditolak sekarang daripada semua barisnya gagal satu per satu.
  for (const wajib of ['name', 'price'] as const) {
    if (![...fieldByColumn.values()].includes(wajib)) {
      throw badRequest(`Kolom "${wajib === 'name' ? 'nama' : 'harga'}" tidak ditemukan di file.`);
    }
  }

  const rows: RawImportRow[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const values: Record<string, string> = {};
    let isiAda = false;

    for (const [colNumber, field] of fieldByColumn) {
      const text = cellToText(row.getCell(colNumber).value).trim();
      if (text) {
        values[field] = text;
        isiAda = true;
      }
    }

    // Baris kosong di tengah/bawah file itu wajar (sisa format Excel),
    // jangan dihitung sebagai baris gagal.
    if (isiAda) rows.push({ rowNumber, values });
  });

  if (rows.length > MAX_IMPORT_ROWS) {
    throw badRequest(
      `Isi file ${rows.length} baris, melebihi batas ${MAX_IMPORT_ROWS} baris sekali import. Pecah jadi beberapa file.`
    );
  }

  return rows;
}
