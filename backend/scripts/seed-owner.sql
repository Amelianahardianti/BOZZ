-- Jalankan sekali aja pas database baru dibikin, buat isi akun Owner
-- pertama (yang lain nanti dibikin lewat form "Tambah Staff" di aplikasi).
--
-- Password default akun ini: owner123 -- WAJIB diganti setelah first login,
-- ini cuma buat mulai/testing.
--
-- Cara pakai: buka SQL editor di Supabase/Neon, paste, lalu Run.

INSERT INTO users (name, email_or_username, password_hash, role, is_active)
VALUES (
  'Owner Toko',
  'owner',
  '$2a$10$fLVt8NhZz6di1wUlhuIwK.ZD3o2Cr3eo.HyTf1bCkZkWonGCY2oHG', -- hash dari "owner123"
  'owner',
  true
)
ON CONFLICT (email_or_username) DO NOTHING;