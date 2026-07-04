/**
 * menu-service/src/index.js
 *
 * PUBLIC service. GET endpoints bebas diakses.
 * POST / hanya ADMIN atau RESTAURANT_ADMIN — verifikasi JWT sendiri.
 */
'use strict';
require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'menu-service';

app.use(express.json());

function requireRole(...roles) {
  return (req, res, next) => {
    const auth = req.headers['authorization'] || '';
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token tidak ditemukan.' });
    }
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
      if (!roles.includes(payload.role)) {
        return res.status(403).json({ error: `Akses ditolak. Hanya role: ${roles.join(', ')}.` });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Token tidak valid atau kadaluarsa.' });
    }
  };
}

const MENU_SELECT = `
  SELECT m.id, m.restaurant_id, r.name AS restaurant_name,
         m.name, m.description, m.price, m.stock, m.created_at
  FROM menus m
  JOIN restaurants r ON r.id = m.restaurant_id
`;

app.get('/health', (req, res) => {
  res.json({ service: serviceName, status: 'OK', timestamp: new Date().toISOString() });
});

// ── GET / — semua menu (join nama restoran) ────────────────────
app.get('/', async (req, res) => {
  try {
    const result = await pool.query(`${MENU_SELECT} ORDER BY m.id ASC`);
    res.json({ data: result.rows, total: result.rowCount });
  } catch (err) {
    console.error('[GET /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /restaurant/:restaurantId — menu by restoran ──────────
// NOTE: harus sebelum GET /:id agar tidak bertabrakan
app.get('/restaurant/:restaurantId', async (req, res) => {
  try {
    const rId = parseInt(req.params.restaurantId, 10);
    if (isNaN(rId)) return res.status(400).json({ error: 'restaurant_id tidak valid.' });

    // Cek restoran ada
    const rest = await pool.query('SELECT id FROM restaurants WHERE id = $1', [rId]);
    if (rest.rows.length === 0) {
      return res.status(404).json({ error: 'Restoran tidak ditemukan.' });
    }
    const result = await pool.query(
      `${MENU_SELECT} WHERE m.restaurant_id = $1 ORDER BY m.id ASC`,
      [rId]
    );
    res.json({ data: result.rows, total: result.rowCount });
  } catch (err) {
    console.error('[GET /restaurant/:id] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /:id — detail menu ─────────────────────────────────────
app.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID tidak valid.' });

    const result = await pool.query(`${MENU_SELECT} WHERE m.id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu tidak ditemukan.' });
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[GET /:id] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST / — tambah menu (ADMIN atau RESTAURANT_ADMIN) ─────────
app.post('/', requireRole('ADMIN', 'RESTAURANT_ADMIN'), async (req, res) => {
  try {
    const { restaurant_id, name, description, price, stock = 0 } = req.body;
    if (!restaurant_id || !name || price === undefined) {
      return res.status(400).json({ error: 'Field restaurant_id, name, dan price wajib diisi.' });
    }
    if (typeof price !== 'number' || price < 0) {
      return res.status(400).json({ error: 'Price harus angka positif.' });
    }
    // Cek restoran ada
    const rest = await pool.query('SELECT id FROM restaurants WHERE id = $1', [restaurant_id]);
    if (rest.rows.length === 0) {
      return res.status(404).json({ error: 'Restoran tidak ditemukan.' });
    }
    const result = await pool.query(
      `INSERT INTO menus (restaurant_id, name, description, price, stock)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, restaurant_id, name, description, price, stock, created_at`,
      [restaurant_id, name.trim(), description || null, price, stock]
    );
    res.status(201).json({ message: 'Menu berhasil ditambahkan.', data: result.rows[0] });
  } catch (err) {
    console.error('[POST /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} tidak ditemukan.` }));

app.listen(port, () => console.log(`[${serviceName}] Listening on port ${port}`));
