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
  transform: {
    // tsconfig utama pakai module NodeNext (buat runtime Node), tapi Jest
    // jalan di CommonJS. Di-override khusus test biar ts-jest tidak
    // protes soal "hybrid module kind".
    '^.+\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS' } }],
  },
};
