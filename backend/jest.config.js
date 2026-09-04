// Konfigurasi Jest untuk backend. Tanpa file ini `npm test` cuma lolos
// karena flag --passWithNoTests, bukan karena testnya jalan.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  // Test import app.ts langsung, bukan lewat main.ts -- jadi
  // 'import dotenv/config' di main.ts tidak ikut kepanggil. Tanpa ini
  // DATABASE_URL undefined pas jest jalan, dan test yang butuh koneksi
  // DB beneran (mis. login) gagal bukan karena salah, tapi karena env
  // kosong.
  setupFiles: ['dotenv/config'],
  // Nutup pool pg + PrismaClient abis tiap file test selesai (lihat
  // komentar di file itu sendiri) -- tanpa ini worker Jest nyangkut.
  setupFilesAfterEnv: ['<rootDir>/test/jest.teardown-db.ts'],
  // Hapus jejak run sebelumnya sekali di awal. Wajib sejak data test
  // benar-benar tersimpan di Postgres -- alasan lengkapnya ada di
  // file-nya sendiri.
  globalSetup: '<rootDir>/test/jest.global-setup.ts',
  // Semua test sekarang memakai SATU database Postgres yang sama (sejak
  // sales-inventory tersambung ke Postgres). Kalau file test jalan
  // paralel, worker lain bisa menyisipkan baris di tengah-tengah test
  // yang sedang memeriksa daftar/pagination, dan test-nya merah bukan
  // karena kodenya salah. Dijalankan satu per satu supaya hasilnya
  // menentu.
  maxWorkers: 1,
  // Tiap test sekarang bolak-balik ke Postgres yang nun jauh di sana
  // (Supabase), bukan lagi ke array di memori. Satu test yang bikin
  // produk + dua checkout + dua query daftar gampang lewat dari batas
  // default Jest yang cuma 5 detik -- merahnya bukan karena kodenya salah,
  // tapi karena jaringannya.
  testTimeout: 30000,
  transform: {
    // tsconfig utama pakai module NodeNext (buat runtime Node), tapi Jest
    // jalan di CommonJS. Di-override khusus test biar ts-jest tidak
    // protes soal "hybrid module kind".
    '^.+\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }],
  },
};
