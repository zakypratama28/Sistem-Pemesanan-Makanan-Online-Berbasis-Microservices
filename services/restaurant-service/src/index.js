/**
 * restaurant-service/src/index.js
 *
 * PUBLIC service (tidak diproteksi Traefik ForwardAuth).
 * GET / dan GET /:id bebas diakses.
 * POST / hanya ADMIN — service memverifikasi JWT sendiri.
 */
'use strict';
require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'restaurant-service';

app.use(express.json());

// ── In-service JWT auth (hanya untuk write endpoints) ──────────
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

// ── Health ──────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ service: serviceName, status: 'OK', timestamp: new Date().toISOString() });
});

// ── GET / — daftar semua restoran ──────────────────────────────
app.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, address, status, created_at FROM restaurants ORDER BY id ASC'
    );
    res.json({ data: result.rows, total: result.rowCount });
  } catch (err) {
    console.error('[GET /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /:id — detail restoran ─────────────────────────────────
app.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID tidak valid.' });

    const result = await pool.query(
      'SELECT id, name, address, status, created_at FROM restaurants WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Restoran tidak ditemukan.' });
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[GET /:id] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST / — tambah restoran (ADMIN only) ─────────────────────
app.post('/', requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, address, status = 'OPEN' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Field name wajib diisi.' });
    }
    const validStatuses = ['OPEN', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status tidak valid. Pilihan: ${validStatuses.join(', ')}.` });
    }
    const result = await pool.query(
      `INSERT INTO restaurants (name, address, status)
       VALUES ($1, $2, $3)
       RETURNING id, name, address, status, created_at`,
      [name.trim(), address || null, status]
    );
    res.status(201).json({ message: 'Restoran berhasil ditambahkan.', data: result.rows[0] });
  } catch (err) {
    console.error('[POST /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} tidak ditemukan.` }));

app.listen(port, () => console.log(`[${serviceName}] Listening on port ${port}`));
