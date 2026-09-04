// backend/src/modules/sales-inventory/internal/store.ts

// Yang tersisa di memori HANYA daftar job import produk. Kategori,
// produk, transaksi, penyesuaian stok, dan ticket sudah pindah ke
// Postgres (lihat repository.ts).
//
// Kenapa job import TIDAK ikut pindah ke database?
//
// Pemrosesannya jalan lewat setImmediate() di dalam proses ini juga
// (service.ts -> startProductImport), bukan lewat job queue. Kalau
// barisnya disimpan di database dan proses mati di tengah impor, baris
// itu nyangkut di status `processing` SELAMANYA -- tidak ada satu pun
// pekerja yang akan menyelesaikannya, dan frontend polling tanpa ujung.
// Disimpan di memori, job-nya ikut hilang bersama prosesnya dan
// GET /products/import/:jobId jujur membalas 404, jadi frontend tahu
// harus mengulang.
//
// Menjadikannya benar-benar tahan restart butuh job queue sungguhan
// (SRS 9.8/10.8) -- itu perubahan tersendiri, bukan bagian dari
// pemindahan ke database.

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

export const importJobs: ImportJob[] = [];

let importJobIdCounter = 1;
export function nextImportJobId(): string {
  return `import-job-${importJobIdCounter++}`;
}
