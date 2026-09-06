-- Data contoh modul Sales & Inventory: kategori + beberapa produk.
--
-- Dulu data ini muncul sendiri dari array di internal/store.ts. Sejak
-- modulnya tersambung ke Postgres, data contoh TIDAK lagi dibuat otomatis
-- -- kalau otomatis, produk contekan ikut kebawa ke database production.
-- Jadi dijalankan manual, sekali saja, di database dev.
--
-- Cara pakai: buka SQL editor di Supabase/Neon, paste, lalu Run.
-- Aman dijalankan berulang (ON CONFLICT DO NOTHING).
--
-- id-nya sengaja tetap (bukan gen_random_uuid()) supaya test dan tim
-- frontend punya baris yang bisa dirujuk dengan pasti.

INSERT INTO categories (id, name, created_by) VALUES
  ('11111111-1111-4111-8111-111111111101', 'Makanan', NULL),
  ('11111111-1111-4111-8111-111111111102', 'Minuman', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (
  id, category_id, name, sku, price, cost_price,
  stock_qty, low_stock_threshold, unit, is_active, created_by
) VALUES
  (
    '22222222-2222-4222-8222-222222222201',
    '11111111-1111-4111-8111-111111111101',
    'Roti Tawar', 'RTW-001', 15000, 11000,
    24, 5, 'pcs', true, NULL
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    '11111111-1111-4111-8111-111111111102',
    -- stok (3) sengaja di bawah ambang (10): dipakai buat mencoba
    -- tampilan peringatan stok menipis di frontend.
    'Teh Botol', 'TBT-001', 5000, 3500,
    3, 10, 'botol', true, NULL
  )
ON CONFLICT (id) DO NOTHING;
