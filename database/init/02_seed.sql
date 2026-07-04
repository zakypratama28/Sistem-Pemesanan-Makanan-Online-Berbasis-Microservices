-- =============================================================
-- FILE: database/init/02_seed.sql
-- PURPOSE: Mengisi data awal (seed) untuk development & testing
-- NOTE: File ini dieksekusi setelah 01_init.sql oleh PostgreSQL
--       saat container pertama kali dibuat.
--
-- PASSWORD DUMMY:
--   Semua password_hash diisi dengan teks dummy karena bcrypt
--   belum diimplementasikan. Akan diganti di tahap auth-service.
--   Format referensi: $2b$10$<hash> (bcrypt)
-- =============================================================

-- -------------------------
-- SEED: users
-- -------------------------
-- Password hash bcrypt untuk semua akun seed: "password" (bcryptjs, cost=10)
-- Hash: $2b$10$Z6JKhq6//EAMKDnXK3l3yulODN/o/HmLnj2oPe4SyZShHAKdOolZm
INSERT INTO users (name, email, password_hash, role) VALUES
  ('Super Admin',    'admin@foodorder.id', '$2b$10$Z6JKhq6//EAMKDnXK3l3yulODN/o/HmLnj2oPe4SyZShHAKdOolZm', 'ADMIN'),
  ('Budi Pelanggan', 'budi@foodorder.id',  '$2b$10$Z6JKhq6//EAMKDnXK3l3yulODN/o/HmLnj2oPe4SyZShHAKdOolZm', 'CUSTOMER'),
  ('Sari Restoran',  'sari@foodorder.id',  '$2b$10$Z6JKhq6//EAMKDnXK3l3yulODN/o/HmLnj2oPe4SyZShHAKdOolZm', 'RESTAURANT_ADMIN'),
  ('Raka Kurir',     'raka@foodorder.id',  '$2b$10$Z6JKhq6//EAMKDnXK3l3yulODN/o/HmLnj2oPe4SyZShHAKdOolZm', 'COURIER')
ON CONFLICT (email) DO NOTHING;

-- -------------------------
-- SEED: restaurants
-- -------------------------
INSERT INTO restaurants (name, address, status) VALUES
  ('Warung Nusantara',  'Jl. Sudirman No. 10, Jakarta Pusat',   'OPEN'),
  ('Kedai Padang Jaya', 'Jl. Gatot Subroto No. 45, Jakarta Selatan', 'OPEN')
ON CONFLICT DO NOTHING;

-- -------------------------
-- SEED: menus (restaurant_id menggunakan subquery agar aman)
-- -------------------------
INSERT INTO menus (restaurant_id, name, description, price, stock) VALUES
  -- Warung Nusantara (id=1)
  (
    (SELECT id FROM restaurants WHERE name = 'Warung Nusantara' LIMIT 1),
    'Nasi Goreng Spesial',
    'Nasi goreng dengan telur, ayam suwir, dan acar timun.',
    25000,
    50
  ),
  (
    (SELECT id FROM restaurants WHERE name = 'Warung Nusantara' LIMIT 1),
    'Mie Ayam Bakso',
    'Mie kuning dengan potongan ayam dan bakso kenyal.',
    22000,
    40
  ),
  (
    (SELECT id FROM restaurants WHERE name = 'Warung Nusantara' LIMIT 1),
    'Es Teh Manis',
    'Teh manis dingin dengan es batu.',
    5000,
    100
  ),
  -- Kedai Padang Jaya (id=2)
  (
    (SELECT id FROM restaurants WHERE name = 'Kedai Padang Jaya' LIMIT 1),
    'Rendang Sapi',
    'Rendang daging sapi empuk dengan bumbu rempah khas Padang.',
    45000,
    30
  ),
  (
    (SELECT id FROM restaurants WHERE name = 'Kedai Padang Jaya' LIMIT 1),
    'Ayam Pop',
    'Ayam goreng khas Padang yang gurih dan renyah.',
    35000,
    35
  ),
  (
    (SELECT id FROM restaurants WHERE name = 'Kedai Padang Jaya' LIMIT 1),
    'Gulai Ikan Tongkol',
    'Ikan tongkol dimasak dengan kuah gulai kuning kaya rempah.',
    30000,
    25
  )
ON CONFLICT DO NOTHING;

-- -------------------------
-- SEED: orders (1 contoh order)
-- -------------------------
INSERT INTO orders (user_id, restaurant_id, total_price, status) VALUES
  (
    (SELECT id FROM users WHERE email = 'budi@foodorder.id' LIMIT 1),
    (SELECT id FROM restaurants WHERE name = 'Warung Nusantara' LIMIT 1),
    50000,
    'DELIVERED'
  );

-- -------------------------
-- SEED: order_items (untuk order contoh di atas)
-- -------------------------
INSERT INTO order_items (order_id, menu_id, quantity, price)
SELECT
  (SELECT id FROM orders WHERE user_id = (SELECT id FROM users WHERE email = 'budi@foodorder.id' LIMIT 1) LIMIT 1),
  (SELECT id FROM menus WHERE name = 'Nasi Goreng Spesial' LIMIT 1),
  1,
  25000;

INSERT INTO order_items (order_id, menu_id, quantity, price)
SELECT
  (SELECT id FROM orders WHERE user_id = (SELECT id FROM users WHERE email = 'budi@foodorder.id' LIMIT 1) LIMIT 1),
  (SELECT id FROM menus WHERE name = 'Es Teh Manis' LIMIT 1),
  5,
  5000;

-- -------------------------
-- SEED: payments (untuk order contoh)
-- -------------------------
INSERT INTO payments (order_id, amount, status, payment_method)
SELECT
  (SELECT id FROM orders WHERE user_id = (SELECT id FROM users WHERE email = 'budi@foodorder.id' LIMIT 1) LIMIT 1),
  50000,
  'PAID',
  'TRANSFER';

-- -------------------------
-- SEED: deliveries (untuk order contoh)
-- -------------------------
INSERT INTO deliveries (order_id, courier_id, status, address)
SELECT
  (SELECT id FROM orders WHERE user_id = (SELECT id FROM users WHERE email = 'budi@foodorder.id' LIMIT 1) LIMIT 1),
  (SELECT id FROM users WHERE email = 'raka@foodorder.id' LIMIT 1),
  'DELIVERED',
  'Jl. Kebon Jeruk No. 7, Jakarta Barat';

-- -------------------------
-- SEED: notifications (beberapa notifikasi contoh)
-- -------------------------
INSERT INTO notifications (user_id, title, message, is_read) VALUES
  (
    (SELECT id FROM users WHERE email = 'budi@foodorder.id' LIMIT 1),
    'Pesanan Diterima',
    'Pesanan Anda #1 telah diterima oleh Warung Nusantara dan sedang diproses.',
    TRUE
  ),
  (
    (SELECT id FROM users WHERE email = 'budi@foodorder.id' LIMIT 1),
    'Pesanan Sedang Diantar',
    'Pesanan Anda #1 sedang dalam perjalanan. Kurir: Raka Kurir.',
    TRUE
  ),
  (
    (SELECT id FROM users WHERE email = 'budi@foodorder.id' LIMIT 1),
    'Pesanan Tiba',
    'Pesanan Anda #1 telah tiba. Selamat menikmati!',
    FALSE
  ),
  (
    (SELECT id FROM users WHERE email = 'raka@foodorder.id' LIMIT 1),
    'Pengiriman Baru',
    'Ada pengiriman baru untuk Anda. Silakan ambil pesanan di Warung Nusantara.',
    TRUE
  )
ON CONFLICT DO NOTHING;
