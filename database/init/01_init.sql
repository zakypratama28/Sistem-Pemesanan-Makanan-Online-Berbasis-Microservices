-- =============================================================
-- FILE: database/init/01_init.sql
-- PURPOSE: Membuat semua tabel database food_ordering_db
-- NOTE: File ini dieksekusi otomatis oleh PostgreSQL saat
--       container pertama kali dibuat (docker-entrypoint-initdb.d)
-- =============================================================

-- -------------------------
-- Tabel: users
-- -------------------------
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100)  NOT NULL,
    email         VARCHAR(150)  UNIQUE NOT NULL,
    password_hash TEXT          NOT NULL,
    role          VARCHAR(30)   NOT NULL,   -- ADMIN | CUSTOMER | RESTAURANT_ADMIN | COURIER
    created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- Tabel: restaurants
-- -------------------------
CREATE TABLE IF NOT EXISTS restaurants (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(150) NOT NULL,
    address    TEXT,
    status     VARCHAR(30)  DEFAULT 'OPEN',  -- OPEN | CLOSED
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- Tabel: menus
-- -------------------------
CREATE TABLE IF NOT EXISTS menus (
    id            SERIAL PRIMARY KEY,
    restaurant_id INTEGER      REFERENCES restaurants(id) ON DELETE CASCADE,
    name          VARCHAR(150) NOT NULL,
    description   TEXT,
    price         INTEGER      NOT NULL,   -- harga dalam satuan terkecil (Rupiah)
    stock         INTEGER      DEFAULT 0,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- Tabel: carts
-- -------------------------
CREATE TABLE IF NOT EXISTS carts (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER   REFERENCES users(id) ON DELETE CASCADE,
    menu_id    INTEGER   REFERENCES menus(id) ON DELETE CASCADE,
    quantity   INTEGER   NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- Tabel: orders
-- -------------------------
CREATE TABLE IF NOT EXISTS orders (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER   REFERENCES users(id),
    restaurant_id INTEGER   REFERENCES restaurants(id),
    total_price   INTEGER   NOT NULL,
    status        VARCHAR(30) DEFAULT 'PENDING',  -- PENDING | PROCESSING | DELIVERED | CANCELLED
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- Tabel: order_items
-- -------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id       SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_id  INTEGER NOT NULL REFERENCES menus(id),
    quantity INTEGER NOT NULL,
    price    INTEGER NOT NULL  -- harga snapshot saat order dibuat
);

-- -------------------------
-- Tabel: payments
-- -------------------------
CREATE TABLE IF NOT EXISTS payments (
    id             SERIAL PRIMARY KEY,
    order_id       INTEGER    REFERENCES orders(id),
    amount         INTEGER    NOT NULL,
    status         VARCHAR(30) DEFAULT 'PENDING',  -- PENDING | PAID | FAILED | REFUNDED
    payment_method VARCHAR(50),                    -- TRANSFER | COD | EWALLET
    created_at     TIMESTAMP  DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- Tabel: deliveries
-- -------------------------
CREATE TABLE IF NOT EXISTS deliveries (
    id         SERIAL PRIMARY KEY,
    order_id   INTEGER    REFERENCES orders(id),
    courier_id INTEGER    REFERENCES users(id),
    status     VARCHAR(30) DEFAULT 'WAITING',  -- WAITING | PICKED_UP | ON_THE_WAY | DELIVERED
    address    TEXT,
    created_at TIMESTAMP  DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- Tabel: notifications
-- -------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER      REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(150) NOT NULL,
    message    TEXT         NOT NULL,
    is_read    BOOLEAN      DEFAULT FALSE,
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- Indexes untuk performa query
-- -------------------------
CREATE INDEX IF NOT EXISTS idx_menus_restaurant_id       ON menus(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_carts_user_id             ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id            ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id      ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id      ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id         ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id       ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_courier_id     ON deliveries(courier_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id     ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read     ON notifications(user_id, is_read);
