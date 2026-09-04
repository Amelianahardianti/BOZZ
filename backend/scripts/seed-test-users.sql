-- Akun KHUSUS untuk test otomatis (backend/test/**). Bukan akun manusia.
--
-- Kenapa perlu? Tabel products, transactions, dan tickets punya foreign
-- key ke users (created_by, cashier_user_id, assigned_to_user_id). Sejak
-- modul sales-inventory tersambung ke Postgres, test tidak bisa lagi
-- memakai id karangan seperti 'test-owner' -- id-nya harus UUID yang
-- benar-benar ada barisnya di tabel users.
--
-- Dibikin terpisah dari akun asli supaya data test tidak nyampur ke
-- jejak audit akun sungguhan: produk buatan test tidak muncul sebagai
-- "dibuat oleh Owner Toko", dan pengepak asli tidak kebanjiran
-- notifikasi ticket dari test.
--
-- password_hash-nya sengaja bukan hash yang valid: akun ini TIDAK boleh
-- bisa dipakai login. Test membuat JWT-nya sendiri (test/helpers/auth.ts),
-- tidak pernah lewat POST /auth/login.
--
-- Cara pakai: jalankan di database yang dipakai `npm test`.

INSERT INTO users (id, name, email_or_username, password_hash, role, is_active) VALUES
  (
    '33333333-3333-4333-8333-333333333301',
    '[test] Owner', 'test-owner-otomatis',
    'x-tidak-bisa-login', 'owner', true
  ),
  (
    '33333333-3333-4333-8333-333333333302',
    '[test] Kasir', 'test-kasir-otomatis',
    'x-tidak-bisa-login', 'kasir', true
  ),
  (
    '33333333-3333-4333-8333-333333333303',
    '[test] Pengepak', 'test-pengepak-otomatis',
    'x-tidak-bisa-login', 'pengepak', true
  )
ON CONFLICT (id) DO NOTHING;
