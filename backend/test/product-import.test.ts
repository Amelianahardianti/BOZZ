// backend/test/product-import.test.ts

// Menguji POST /api/products/import (contracts/api.yaml: 202 + job_id)
// beserta endpoint pantau statusnya.

import ExcelJS from 'exceljs';
import request from 'supertest';
import { app } from '../src/app';
import { OWNER_ID, kasirToken, ownerToken } from './helpers/auth';
import { describe, expect, it, jest } from '@jest/globals';

/** Rakit file .xlsx beneran di memori, biar yang diuji parser aslinya. */
async function buildWorkbook(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Produk');
  rows.forEach((row) => sheet.addRow(row));
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}

/**
 * Pantau 1 job sampai kelar. Dipisah dari importAndWait supaya test
 * "membalas 202 ... tidak menunggu prosesnya selesai" TETAP bisa
 * assert 202-nya instan (gak nunggu apa-apa dulu), tapi habis itu
 * tetap ngedrain job-nya sendiri di background -- biar gak ninggalin
 * kerjaan async nyangkut yang numpuk ke test berikutnya (job import
 * sebelumnya yang belum kelar bisa bikin polling test lain keliru
 * baca job MILIK SENDIRI vs job numpukan test sebelumnya).
 *
 * 404 di sini SENGAJA diperlakukan sama kayak "belum selesai" (bukan
 * gagal langsung) -- job-nya dijamin ADA (job_id dari response 202),
 * tapi prosesnya jalan di background (setImmediate), jadi ada jeda
 * wajar sebelum status-nya kebaca konsisten. Yang beneran ditest tetap
 * sama: job HARUS balik 200 + status final dalam batas waktu (50x20ms),
 * atau gagal apa adanya lewat throw di akhir -- bukan ditutup-tutupin.
 */
async function waitForJobToFinish(token: string, jobId: string) {
  for (let i = 0; i < 50; i += 1) {
    const status = await request(app)
      .get(`/api/products/import/${jobId}`)
      .set('Authorization', `Bearer ${token}`);
    if (status.status === 200 && (status.body.status === 'done' || status.body.status === 'failed')) {
      return status.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('Job import tidak selesai-selesai.');
}

/** Kirim file, tunggu job-nya kelar, kembalikan laporan akhirnya. */
async function importAndWait(token: string, buffer: Buffer, filename = 'produk.xlsx') {
  const upload = await request(app)
    .post('/api/products/import')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buffer, filename);

  expect(upload.status).toBe(202);
  expect(upload.body.job_id).toBeTruthy();
  expect(upload.body.status).toBe('queued');

  return waitForJobToFinish(token, upload.body.job_id);
}

const HEADER = ['Nama Produk', 'SKU', 'Kategori', 'Harga', 'Stok', 'Stok Minim', 'Satuan'];

describe('POST /api/products/import', () => {
  it('membalas 202 dengan job_id, tidak menunggu prosesnya selesai', async () => {
    const token = ownerToken();
    const file = await buildWorkbook([HEADER, ['Impor Cepat', 'IMP-CEPAT', 'Makanan', 9000, 3, 2, 'pcs']]);

    const res = await request(app)
      .post('/api/products/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, 'produk.xlsx');

    expect(res.status).toBe(202);
    expect(Object.keys(res.body).sort()).toEqual(['job_id', 'status']);
    expect(res.body.status).toBe('queued');

    // Yang mau ditest di atas ("202 instan") udah kejawab. Drain job-nya
    // di sini SETELAH assert-nya, biar test berikutnya gak mulai
    // sementara job punya test ini masih jalan di background.
    await waitForJobToFinish(token, res.body.job_id);
  });

  it('membuat produk baru dari isi file', async () => {
    const token = ownerToken();
    const file = await buildWorkbook([
      HEADER,
      ['Kecap Manis', 'KCP-001', 'Makanan', 18500, 12, 4, 'botol'],
      ['Sabun Cuci', 'SBN-001', '', 7500, 20, '', 'pcs'],
    ]);

    const laporan = await importAndWait(token, file);

    expect(laporan.status).toBe('done');
    expect(laporan.total_rows).toBe(2);
    expect(laporan.created).toBe(2);
    expect(laporan.updated).toBe(0);
    expect(laporan.failed).toBe(0);
    expect(laporan.errors).toEqual([]);

    const cek = await request(app)
      .get('/api/products')
      .query({ search: 'KCP-001' })
      .set('Authorization', `Bearer ${token}`);
    const produk = cek.body.data[0];
    expect(produk.name).toBe('Kecap Manis');
    expect(produk.price).toBe(18500);
    expect(produk.stock_qty).toBe(12);
    expect(produk.low_stock_threshold).toBe(4);
    expect(produk.unit).toBe('botol');
    expect(produk.category_name).toBe('Makanan');

    // kolom yang dikosongkan pakai default
    const kedua = await request(app)
      .get('/api/products')
      .query({ search: 'SBN-001' })
      .set('Authorization', `Bearer ${token}`);
    expect(kedua.body.data[0].low_stock_threshold).toBe(5);
    expect(kedua.body.data[0].category_id).toBeNull();
  });

  it('memperbarui produk yang SKU-nya sudah ada, bukan bikin dobel', async () => {
    const token = ownerToken();
    await importAndWait(
      token,
      await buildWorkbook([HEADER, ['Nama Lama', 'UPD-001', '', 1000, 5, 2, 'pcs']])
    );

    const laporan = await importAndWait(
      token,
      await buildWorkbook([HEADER, ['Nama Baru', 'UPD-001', 'Minuman', 2000, 5, 3, 'botol']])
    );

    expect(laporan.created).toBe(0);
    expect(laporan.updated).toBe(1);

    const cek = await request(app)
      .get('/api/products')
      .query({ search: 'UPD-001' })
      .set('Authorization', `Bearer ${token}`);
    expect(cek.body.total).toBe(1);
    expect(cek.body.data[0].name).toBe('Nama Baru');
    expect(cek.body.data[0].price).toBe(2000);
    expect(cek.body.data[0].category_name).toBe('Minuman');
  });

  it('tidak menimpa stok produk lama, tapi memberi tahu lewat warnings', async () => {
    const token = ownerToken();
    await importAndWait(
      token,
      await buildWorkbook([HEADER, ['Stok Dijaga', 'STK-001', '', 1000, 7, 2, 'pcs']])
    );

    const laporan = await importAndWait(
      token,
      await buildWorkbook([HEADER, ['Stok Dijaga', 'STK-001', '', 1000, 999, 2, 'pcs']])
    );

    expect(laporan.updated).toBe(1);
    expect(laporan.warnings).toHaveLength(1);
    expect(laporan.warnings[0].row).toBe(2);
    expect(laporan.warnings[0].message).toMatch(/stok/i);

    const cek = await request(app)
      .get('/api/products')
      .query({ search: 'STK-001' })
      .set('Authorization', `Bearer ${token}`);
    expect(cek.body.data[0].stock_qty).toBe(7);
  });

  it('meloloskan baris yang benar dan melaporkan nomor baris yang salah', async () => {
    const token = ownerToken();
    const file = await buildWorkbook([
      HEADER,
      ['Baris Benar', 'OK-001', 'Makanan', 5000, 2, 1, 'pcs'], // baris 2
      ['', 'KOSONG-001', '', 5000, 2, 1, 'pcs'], // baris 3: nama kosong
      ['Harga Bukan Angka', 'NAN-001', '', 'sepuluh ribu', 2, 1, 'pcs'], // baris 4
      ['Kategori Ngawur', 'KTG-001', 'Kategori Tidak Ada', 5000, 2, 1, 'pcs'], // baris 5
      ['Harga Minus', 'MIN-001', '', -5000, 2, 1, 'pcs'], // baris 6
    ]);

    const laporan = await importAndWait(token, file);

    expect(laporan.status).toBe('done');
    expect(laporan.total_rows).toBe(5);
    expect(laporan.created).toBe(1);
    expect(laporan.failed).toBe(4);
    expect(laporan.errors.map((e: { row: number }) => e.row)).toEqual([3, 4, 5, 6]);
    expect(laporan.errors[2].message).toMatch(/Kategori Tidak Ada/);

    // baris yang benar tetap masuk walau ada baris lain yang gagal
    const cek = await request(app)
      .get('/api/products')
      .query({ search: 'OK-001' })
      .set('Authorization', `Bearer ${token}`);
    expect(cek.body.total).toBe(1);

    // baris yang gagal tidak menyisakan produk setengah jadi
    const gagal = await request(app)
      .get('/api/products')
      .query({ search: 'KTG-001' })
      .set('Authorization', `Bearer ${token}`);
    expect(gagal.body.total).toBe(0);
  });

  it('mengabaikan baris kosong dan mengenali nama kolom versi Inggris', async () => {
    const token = ownerToken();
    const file = await buildWorkbook([
      ['Name', 'SKU', 'Price', 'Stock'],
      ['Produk Inggris', 'ENG-001', 4000, 6],
      [],
      ['', '', '', ''],
    ]);

    const laporan = await importAndWait(token, file);

    expect(laporan.total_rows).toBe(1);
    expect(laporan.created).toBe(1);
    expect(laporan.failed).toBe(0);
  });

  it('menggagalkan seluruh job kalau kolom wajib tidak ada di file', async () => {
    const token = ownerToken();
    const file = await buildWorkbook([
      ['Kolom', 'Yang', 'Aneh'],
      ['a', 'b', 'c'],
    ]);

    const laporan = await importAndWait(token, file);

    expect(laporan.status).toBe('failed');
    expect(laporan.message).toMatch(/kolom/i);
    expect(laporan.created).toBe(0);
  });

  it('menggagalkan job kalau isi filenya bukan xlsx beneran', async () => {
    const token = ownerToken();

    const laporan = await importAndWait(token, Buffer.from('ini cuma teks biasa'), 'palsu.xlsx');

    expect(laporan.status).toBe('failed');
    expect(laporan.message).toMatch(/tidak bisa dibaca/i);
  });

  it('menolak file berekstensi .xls dengan saran menyimpan ulang', async () => {
    const token = ownerToken();
    const file = await buildWorkbook([HEADER, ['Produk Xls', 'XLS-001', '', 1000, 1, 1, 'pcs']]);

    const res = await request(app)
      .post('/api/products/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, 'produk-lawas.xls');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/\.xlsx/);
  });

  it('menolak request tanpa file', async () => {
    const token = ownerToken();

    const res = await request(app)
      .post('/api/products/import')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('menolak file yang dikirim di nama field yang salah', async () => {
    const token = ownerToken();
    const file = await buildWorkbook([HEADER]);

    const res = await request(app)
      .post('/api/products/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('berkas', file, 'produk.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/"file"/);
  });

  it('melarang role selain owner mengimpor produk', async () => {
    const token = kasirToken();
    const file = await buildWorkbook([HEADER, ['Dari Kasir', 'KSR-001', '', 1000, 1, 1, 'pcs']]);

    const res = await request(app)
      .post('/api/products/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, 'produk.xlsx');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('menolak request tanpa token', async () => {
    const res = await request(app).post('/api/products/import');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/products/import/:jobId', () => {
  it('membalas 404 kalau job-nya tidak ada', async () => {
    const token = ownerToken();

    const res = await request(app)
      .get('/api/products/import/job-hantu')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
