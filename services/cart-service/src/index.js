/**
 * cart-service/src/index.js
 *
 * PROTECTED (Traefik ForwardAuth sudah berjalan).
 * User diambil dari header X-User-* yang diteruskan Traefik.
 * Hanya CUSTOMER yang boleh mengakses cart.
 */
'use strict';
require('dotenv').config();

const express = require('express');
const pool = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'cart-service';

app.use(express.json());

// ── Baca user dari header Traefik ForwardAuth ───────────────────
function getUser(req) {
  return {
    id: parseInt(req.headers['x-user-id'], 10),
    email: req.headers['x-user-email'],
    role: req.headers['x-user-role'],
  };
}

function requireCustomer(req, res, next) {
  const user = getUser(req);
  if (user.role !== 'CUSTOMER') {
    return res.status(403).json({ error: 'Akses ditolak. Hanya role CUSTOMER.' });
  }
  next();
}

// ── Health ──────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ service: serviceName, status: 'OK', timestamp: new Date().toISOString() });
});

// ── GET / — tampilkan cart user login ──────────────────────────
app.get('/', requireCustomer, async (req, res) => {
  try {
    const { id: userId } = getUser(req);
    const result = await pool.query(
      `SELECT c.id, c.menu_id, m.name AS menu_name, m.price,
              r.name AS restaurant_name, c.quantity,
              (m.price * c.quantity) AS subtotal, c.created_at
       FROM carts c
       JOIN menus m ON m.id = c.menu_id
       JOIN restaurants r ON r.id = m.restaurant_id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );
    const total = result.rows.reduce((sum, row) => sum + Number(row.subtotal), 0);
    res.json({ data: result.rows, total_items: result.rowCount, grand_total: total });
  } catch (err) {
    console.error('[GET /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST / — tambah atau update item cart ──────────────────────
app.post('/', requireCustomer, async (req, res) => {
  try {
    const { id: userId } = getUser(req);
    const { menu_id, quantity } = req.body;

    if (!menu_id || !quantity) {
      return res.status(400).json({ error: 'Field menu_id dan quantity wajib diisi.' });
    }
    if (quantity < 1) {
      return res.status(400).json({ error: 'Quantity minimal 1.' });
    }

    // Validasi menu ada
    const menuRes = await pool.query('SELECT id, name, price, stock FROM menus WHERE id = $1', [menu_id]);
    if (menuRes.rows.length === 0) {
      return res.status(404).json({ error: 'Menu tidak ditemukan.' });
    }
    const menu = menuRes.rows[0];

    // Cek apakah item sudah ada di cart user (menu yang sama)
    const existing = await pool.query(
      'SELECT id, quantity FROM carts WHERE user_id = $1 AND menu_id = $2',
      [userId, menu_id]
    );

    const newQty = existing.rows.length > 0 ? existing.rows[0].quantity + quantity : quantity;

    // Validasi stock cukup
    if (menu.stock < newQty) {
      return res.status(400).json({ error: `Stock tidak cukup. Tersedia: ${menu.stock}.` });
    }

    let result;
    if (existing.rows.length > 0) {
      // Update quantity
      result = await pool.query(
        `UPDATE carts SET quantity = $1 WHERE id = $2
         RETURNING id, user_id, menu_id, quantity, created_at`,
        [newQty, existing.rows[0].id]
      );
      return res.json({ message: 'Quantity cart diperbarui.', data: result.rows[0] });
    } else {
      // Insert baru
      result = await pool.query(
        `INSERT INTO carts (user_id, menu_id, quantity) VALUES ($1, $2, $3)
         RETURNING id, user_id, menu_id, quantity, created_at`,
        [userId, menu_id, quantity]
      );
      return res.status(201).json({ message: 'Item berhasil ditambahkan ke cart.', data: result.rows[0] });
    }
  } catch (err) {
    console.error('[POST /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── DELETE /:id — hapus item cart milik user login ─────────────
app.delete('/:id', requireCustomer, async (req, res) => {
  try {
    const { id: userId } = getUser(req);
    const cartId = parseInt(req.params.id, 10);
    if (isNaN(cartId)) return res.status(400).json({ error: 'ID tidak valid.' });

    // Pastikan cart item milik user ini
    const result = await pool.query(
      'DELETE FROM carts WHERE id = $1 AND user_id = $2 RETURNING id',
      [cartId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item cart tidak ditemukan atau bukan milik Anda.' });
    }
    res.json({ message: 'Item cart berhasil dihapus.' });
  } catch (err) {
    console.error('[DELETE /:id] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} tidak ditemukan.` }));

app.listen(port, () => console.log(`[${serviceName}] Listening on port ${port}`));
